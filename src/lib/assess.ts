import { audit, getDb, newId, nowIso } from "./db";
import { SCORE_FLAG, TINY_AMOUNT_CENTS, type Signal } from "./authorize";
import { setCardStatus } from "./cards";
import { env, jevEnabled } from "./env";
import { buildContext, callJev, PROMPT_VERSION, verifyEvidence, type JevContext, type JevOutput } from "./jev";

// ───────────────────────────────────────────────────────────────────────────────
// Combining rules + JEV into an action (PRD §8.6). Auto-freeze needs BOTH layers
// to agree the purchase is high risk, which limits the cost of a false positive.
// ───────────────────────────────────────────────────────────────────────────────

type Sev = "low" | "medium" | "high";
const rank: Record<Sev, number> = { low: 1, medium: 2, high: 3 };
const maxSev = (a: Sev | null, b: Sev | null): Sev | null => (!a ? b : !b ? a : rank[a] >= rank[b] ? a : b);

interface AuthRow {
  id: string;
  card_id: string;
  amount_cents: number;
  decision: string;
  decline_reason: string | null;
  rules_score: number;
  rule_signals: string;
  merchant_name: string;
}

/** Severity a hard decline earns on its own, before any AI involvement. */
function declineSeverity(a: AuthRow, signals: Signal[]): Sev | null {
  if (a.decision !== "declined") return null;
  const ids = new Set(signals.filter((s) => s.hard).map((s) => s.id));
  if (ids.has("H4")) return "high";
  if (!ids.size) return "high"; // declined on stacked risk score
  if (ids.has("H2") || ids.has("H1")) return "medium";
  return "low"; // H3/H5 attempted overspend
}

export interface PolicyOutcome {
  flag: Sev | null;
  freeze: boolean;
  reason: string;
}

export function actionPolicy(a: AuthRow, signals: Signal[], jev: JevOutput | null): PolicyOutcome {
  const rulesHigh = a.rules_score >= SCORE_FLAG || signals.some((s) => s.id === "H4") || (a.decision === "declined" && !signals.some((s) => s.hard));
  const base = declineSeverity(a, signals);

  if (!jev || jev.confidence < 0.6) {
    const flag = maxSev(base, a.rules_score >= SCORE_FLAG ? "medium" : null);
    return {
      flag,
      freeze: false,
      reason: !jev ? "Rules-only thresholds (AI unavailable)" : `JEV confidence ${jev.confidence.toFixed(2)} < 0.6 → rules thresholds`,
    };
  }
  switch (jev.risk_level) {
    case "low":
      return { flag: maxSev(base, a.rules_score >= SCORE_FLAG ? "low" : null), freeze: false, reason: "JEV low risk" };
    case "medium":
      return {
        flag: maxSev(base, "medium"),
        freeze: false,
        reason: rulesHigh ? "Rules ≥ 40 and JEV medium → review, suggest receipt" : "JEV medium → review",
      };
    case "high":
      return rulesHigh
        ? { flag: "high", freeze: true, reason: "Rules ≥ 40 and JEV high → auto-freeze card" }
        : { flag: maxSev(base, "high"), freeze: false, reason: "JEV high on its own → review (no auto-freeze, one layer only)" };
  }
}

function rulesSummary(a: AuthRow, signals: Signal[]): string {
  const scored = signals.filter((s) => s.points > 0);
  if (a.decision === "declined") return `Declined by rules: ${a.decline_reason}.`;
  if (!scored.length) return "No rule signals fired. Purchase looks routine for this card.";
  return `Rules score ${a.rules_score}: ${scored.map((s) => s.evidence).join("; ")}.`;
}

/**
 * Run the post-decision assessment for one authorisation: JEV (if configured)
 * or rules fallback → action policy → flag / auto-freeze.
 */
export async function assessAuthorization(authId: string, opts: { skipJev?: boolean; actor?: string } = {}) {
  const db = getDb();
  const a = db.prepare(`SELECT * FROM authorization WHERE id=?`).get(authId) as AuthRow | undefined;
  if (!a) return;
  const signals = JSON.parse(a.rule_signals) as Signal[];

  // B7: sub-€1 card checks are never flagged and don't need an AI opinion.
  if (a.amount_cents < TINY_AMOUNT_CENTS && a.decision === "approved") {
    insertAssessment(authId, {
      source: "rules_fallback",
      summary: "Card verification (under €1). No review needed.",
      risk_level: "low",
      risk_score: 0,
      fallback_reason: "tiny_amount",
      action_taken: "none",
    });
    return;
  }

  const raId = newId("ra");
  db.prepare(
    `INSERT INTO risk_assessment (id, authorization_id, source, status, summary, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(raId, authId, jevEnabled() && !opts.skipJev ? "jev" : "rules_fallback", "pending", "", nowIso());

  let jev: JevOutput | null = null;
  let fallbackReason: string | null = null;
  if (opts.skipJev) fallbackReason = "Seeded history (JEV not run)";
  else if (!jevEnabled()) fallbackReason = "AI not configured on this server.";

  let ctx: JevContext | null = null;
  if (!fallbackReason) {
    ctx = buildContext(authId);
    const res = await callJev(ctx);
    if (res.ok) {
      jev = res.output;
      const flags = verifyEvidence(ctx, res.output);
      const outcome = actionPolicy(a, signals, jev);
      db.prepare(
        `UPDATE risk_assessment SET source='jev', status='done', model=?, prompt_version=?, risk_score=?, risk_level=?, flags=?, summary=?,
           recommended_action=?, questions=?, confidence=?, latency_ms=?, tokens_in=?, tokens_out=?, cost_usd=?, raw=?, action_taken=? WHERE id=?`,
      ).run(
        res.model,
        PROMPT_VERSION,
        jev.risk_score,
        jev.risk_level,
        JSON.stringify(flags),
        jev.summary,
        jev.recommended_action,
        JSON.stringify(jev.questions_for_purchaser),
        jev.confidence,
        res.latencyMs,
        res.tokensIn ?? null,
        res.tokensOut ?? null,
        res.costUsd ?? null,
        res.raw.slice(0, 8000),
        outcome.reason,
        raId,
      );
      await applyOutcome(a, outcome, jev.summary, opts.actor ?? "jev");
      return;
    }
    fallbackReason = `AI unavailable: ${res.reason}`;
  }

  // F1/F2: rules-only assessment, clearly labelled.
  const outcome = actionPolicy(a, signals, null);
  const level: Sev = a.decision === "declined" || a.rules_score >= 80 ? "high" : a.rules_score >= SCORE_FLAG ? "medium" : "low";
  db.prepare(
    `UPDATE risk_assessment SET source='rules_fallback', status='done', risk_score=?, risk_level=?, summary=?, fallback_reason=?,
       action_taken=?, model=?, prompt_version=? WHERE id=?`,
  ).run(a.rules_score, level, rulesSummary(a, signals), fallbackReason, outcome.reason, null, null, raId);
  await applyOutcome(a, outcome, rulesSummary(a, signals), opts.actor ?? "rules");
}

function insertAssessment(authId: string, f: Record<string, unknown>) {
  getDb()
    .prepare(
      `INSERT INTO risk_assessment (id, authorization_id, source, status, risk_score, risk_level, summary, fallback_reason, action_taken, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(newId("ra"), authId, f.source, "done", f.risk_score, f.risk_level, f.summary, f.fallback_reason, f.action_taken, nowIso());
}

async function applyOutcome(a: AuthRow, outcome: PolicyOutcome, reason: string, actor: string) {
  if (!outcome.flag) return;
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM flag WHERE authorization_id=?`).get(a.id) as
    | { id: string; severity: Sev; status: string }
    | undefined;
  let frozen = false;
  if (outcome.freeze) {
    const card = db.prepare(`SELECT status FROM card WHERE id=?`).get(a.card_id) as { status: string };
    if (card.status === "active") {
      await setCardStatus(a.card_id, "inactive", `Auto-frozen: rules and JEV agree this purchase is high risk (${a.merchant_name})`, actor);
      frozen = true;
    }
  }
  if (existing) {
    // AI can raise suspicion, never lower it.
    const sev = maxSev(existing.severity, outcome.flag)!;
    db.prepare(`UPDATE flag SET severity=?, reason=?, card_frozen=MAX(card_frozen, ?) WHERE id=?`).run(sev, reason, frozen ? 1 : 0, existing.id);
  } else {
    const id = newId("flag");
    db.prepare(
      `INSERT INTO flag (id, authorization_id, severity, status, reason, card_frozen, created_at) VALUES (?,?,?,?,?,?,?)`,
    ).run(id, a.id, outcome.flag, "open", reason, frozen ? 1 : 0, nowIso());
    audit(actor, "flag.opened", id, { authorization_id: a.id, severity: outcome.flag, policy: outcome.reason });
  }
}

// ── In-process job queue (PRD §13.1) ──────────────────────────────────────────
const g = globalThis as unknown as { __balanceJobs?: Set<string> };
g.__balanceJobs ??= new Set();

/** Fire-and-forget JEV job, idempotent on authorization id. */
export function enqueueAssessment(authId: string) {
  const db = getDb();
  const ins = db
    .prepare(`INSERT OR IGNORE INTO job (id, kind, ref_id, status, created_at) VALUES (?,?,?,?,?)`)
    .run(newId("job"), "jev", authId, "queued", nowIso());
  if (ins.changes === 0) return; // already queued/processed
  if (g.__balanceJobs!.has(authId)) return;
  g.__balanceJobs!.add(authId);
  setTimeout(async () => {
    db.prepare(`UPDATE job SET status='running', attempts=attempts+1 WHERE kind='jev' AND ref_id=?`).run(authId);
    try {
      await assessAuthorization(authId);
      db.prepare(`UPDATE job SET status='done' WHERE kind='jev' AND ref_id=?`).run(authId);
    } catch (err) {
      db.prepare(`UPDATE job SET status='failed', error=? WHERE kind='jev' AND ref_id=?`).run(String(err).slice(0, 300), authId);
      console.error("[jev job]", authId, err);
    } finally {
      g.__balanceJobs!.delete(authId);
    }
  }, 0);
}

/** Re-run JEV on demand (e.g. for seeded history, or after a model change). */
export async function rerunAssessment(authId: string, actor: string) {
  await assessAuthorization(authId, { actor });
  audit(actor, "jev.rerun", authId, { model: env.jevModel });
}
