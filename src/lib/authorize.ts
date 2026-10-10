import { getDb, newId } from "./db";
import { cardMonthSpend, cardHasSlot } from "./cards";
import { eventRemaining, postEntry, societyBalances } from "./ledger";
import { merchantKey, recordPaymentReview } from "./recurring";
import { UserError } from "./errors";
import { mccInfo } from "./mcc";
import { addDays, dublinParts, fmtEur } from "./money";
import { resolvePolicy } from "./policy";
import { CARD_RESTRICTION_PROFILES, profileAllowsMcc, type CardRestrictionProfile } from "./card-restrictions";

// ───────────────────────────────────────────────────────────────────────────────
// Synchronous authorisation decision (PRD §6.3, §7). No network calls in here:
// everything reads indexed local tables so it fits comfortably in Stripe's window.
// AI never runs on this path. JEV advises afterwards and can only raise suspicion.
// ───────────────────────────────────────────────────────────────────────────────

export interface Signal {
  id: string;
  label: string;
  points: number; // 0 for hard rules
  hard?: boolean;
  evidence: string;
  data?: Record<string, unknown>;
}

export interface PurchaseInput {
  cardId: string;
  amountCents: number;
  merchantName: string;
  merchantId?: string;
  currency?: string;
  mcc: string;
  merchantCity?: string;
  merchantCountry: string;
  at: string; // UTC ISO purchase time
  stripeAuthId?: string;
  source?: "live" | "seed";
  /** Charge to this event instead of the card's current assignment (synthetic replay only). */
  eventId?: string | null;
}

export interface Decision {
  authorizationId: string | null;
  approved: boolean;
  declineReason: string | null;
  declineCode: string | null;
  score: number;
  signals: Signal[];
  decisionMs: number;
}

export const SCORE_DECLINE = 80;
export const SCORE_FLAG = 40;
export const TINY_AMOUNT_CENTS = 100; // < €1: merchant card checks (B7) — never flagged

interface CardRow {
  id: string;
  society_id: string;
  event_id: string | null;
  member_id: string;
  status: string;
  per_auth_cap_cents: number;
  monthly_limit_cents: number;
  restriction_profile: CardRestrictionProfile;
}
interface EventRow {
  id: string;
  society_id: string;
  name: string;
  type: string;
  start_date: string;
  end_date: string;
  budget_cents: number;
  status: string;
}

const WINDOW_BEFORE_DAYS = 14;
const INJECTION_PATTERN = /\b(ignore|disregard|forget)\b.{0,40}\b(instruction|prompt|previous|above)|risk_score|system prompt|you are (now )?an? |\bjailbreak\b/i;
const WINDOW_AFTER_DAYS = 3;

function hoursBefore(iso: string, h: number) {
  return new Date(new Date(iso).getTime() - h * 3600_000).toISOString();
}

// `event` is null when the card isn't assigned to an event: general society spending,
// limited to money not already reserved for open events.
function computeSignals(input: PurchaseInput, card: CardRow, event: EventRow | null, member: { id: string; cardholder_created_at: string | null }) {
  const db = getDb();
  const signals: Signal[] = [];
  if(input.source !== "seed") {
    const plan=db.prepare(`SELECT plan_status,plan_renews_at FROM society WHERE id=?`).get(card.society_id) as {plan_status:string;plan_renews_at:string|null};
    if(plan.plan_status !== "active" || (plan.plan_renews_at && plan.plan_renews_at<=new Date().toISOString()) || !cardHasSlot(card.id,card.society_id)) signals.push({id:"H1",label:"Card entitlement inactive",points:0,hard:true,evidence:"Renew the Society Plan or extra card slot before using this card."});
  }
  const amount = input.amountCents;
  const mcc = mccInfo(input.mcc);
  const local = dublinParts(input.at);
  const societyId = card.society_id;

  // ── Hard rules ────────────────────────────────────────────────────────────
  if (card.status !== "active") {
    const what =
      card.status === "inactive"
        ? "card is frozen"
        : card.status !== "active"
          ? `card status is ${card.status}`
          : `event “${event!.name}” is closed`;
    signals.push({ id: "H1", label: "Card not active", points: 0, hard: true, evidence: `Declined: ${what}` });
  }

  if (event) {
    const earliest = addDays(event.start_date, -WINDOW_BEFORE_DAYS);
    const latest = addDays(event.end_date, WINDOW_AFTER_DAYS);
    if (local.date < earliest || local.date > latest) {
      signals.push({
        id: "H2",
        label: "Outside event window",
        points: 0,
        hard: false,
        evidence: `Purchase on ${local.date}; “${event.name}” spending runs ${earliest} → ${latest}`,
        data: { purchase_date: local.date, earliest, latest },
      });
    }
  }

  // Card-level spending controls are hard stops. Stripe enforces the same controls on
  // real Issuing cards; the local path remains authoritative for mock/demo purchases.
  if (amount > card.per_auth_cap_cents) {
    signals.push({
      id: "H5",
      label: "Per-purchase limit exceeded",
      points: 0,
      hard: true,
      evidence: `Declined: ${fmtEur(amount)} is over this card's ${fmtEur(card.per_auth_cap_cents)} per-purchase limit`,
    });
  }

  const monthSpent = cardMonthSpend(card.id, input.at);
  if (monthSpent + amount > card.monthly_limit_cents) {
    signals.push({
      id: "H6",
      label: "Monthly limit exceeded",
      points: 0,
      hard: true,
      evidence: `Declined: this purchase would take the card to ${fmtEur(monthSpent + amount)} this month, over its ${fmtEur(card.monthly_limit_cents)} monthly limit`,
      data: { month_spent: monthSpent, monthly_limit: card.monthly_limit_cents },
    });
  }

  const soc = societyBalances(societyId);
  if (event) {
    const ev = eventRemaining(event.id, event.budget_cents);
    if (amount > ev.remaining) {
      signals.push({
        id: "E1",
        label: "Event budget exceeded",
        points: 0,
        hard: false,
        evidence: `${fmtEur(amount)} exceeds remaining event budget (${fmtEur(Math.max(0, ev.remaining))}); review required`,
        data: { amount, event_remaining: ev.remaining, society_available: soc.available },
      });
    }
  }
    if (amount > soc.available) {
      signals.push({
        id: "H3",
        label: "Insufficient budget",
        points: 0,
        hard: true,
        evidence: `${fmtEur(amount)} exceeds available society funds (${fmtEur(Math.max(0, soc.available))})`,
        data: { amount, society_available: soc.available },
      });
    }

  const policy = resolvePolicy(societyId, input.mcc);
  if (policy.action === "block") {
    signals.push({
      id: "H4",
      label: "Blocked merchant category",
      points: 0,
      hard: true,
      evidence: `MCC ${input.mcc} (${mcc.label}) is blocked by UCD policy`,
      data: { mcc: input.mcc },
    });
  }

  if (policy.action !== "block" && !profileAllowsMcc(card.restriction_profile, input.mcc)) {
    signals.push({
      id: "H7",
      label: "Outside card spending profile",
      points: 0,
      hard: true,
      evidence: `Declined: ${mcc.label} is not included in ${CARD_RESTRICTION_PROFILES[card.restriction_profile].label}`,
      data: { mcc: input.mcc, restriction_profile: card.restriction_profile },
    });
  }

  // ── Scored rules ──────────────────────────────────────────────────────────
  if (policy.action === "review" && !(event && policy.preapproved.includes(event.type as never))) {
    signals.push({
      id: "R1",
      label: "Conditional category",
      points: 25,
      evidence: `MCC ${input.mcc} (${mcc.label}) needs review ${event ? `for a ${event.type} event` : "outside an event"}`,
      data: { mcc: input.mcc, event_type: event?.type ?? null },
    });
  }

  const prevSameMcc = db
    .prepare(
      `SELECT COUNT(*) n FROM authorization WHERE society_id=? AND mcc=? AND decision='approved' AND created_at < ?`,
    )
    .get(societyId, input.mcc, input.at) as { n: number };
  if (prevSameMcc.n === 0) {
    signals.push({
      id: "R2",
      label: "New category for society",
      points: 15,
      evidence: `First time this society has spent at MCC ${input.mcc} (${mcc.label})`,
      data: { mcc: input.mcc },
    });
  }

  if (amount >= TINY_AMOUNT_CENTS) {
    let stats = db
      .prepare(`SELECT * FROM society_mcc_stats WHERE society_id=? AND mcc_group=?`)
      .get(societyId, mcc.group) as { n: number; mean_log: number; sd_log: number; median_cents: number } | undefined;
    let baseline = "society";
    if (!stats || stats.n < 5) {
      stats = db
        .prepare(`SELECT * FROM society_mcc_stats WHERE society_id='__global__' AND mcc_group=?`)
        .get(mcc.group) as typeof stats;
      baseline = "global";
    }
    if (stats && stats.n >= 5) {
      const z = (Math.log(amount) - stats.mean_log) / Math.max(stats.sd_log, 0.25);
      if (z > 2.5) {
        signals.push({
          id: "R3",
          label: "Amount outlier",
          points: 20,
          evidence: `${(amount / stats.median_cents).toFixed(1)}× the ${baseline === "society" ? "society's" : "all-society"} median for ${mcc.group} (${fmtEur(stats.median_cents)}), z=${z.toFixed(1)}`,
          data: { z: Number(z.toFixed(2)), median_cents: stats.median_cents, baseline, n: stats.n },
        });
      }
    }
  }

  if (amount >= 0.9 * card.per_auth_cap_cents) {
    signals.push({
      id: "R4",
      label: "Near per-purchase cap",
      points: 10,
      evidence: `${fmtEur(amount)} is ≥ 90% of the ${fmtEur(card.per_auth_cap_cents)} per-purchase cap`,
    });
  }

  if (amount >= 0.8 * card.per_auth_cap_cents) {
    const near = db
      .prepare(
        `SELECT COUNT(*) n FROM authorization WHERE card_id=? AND amount_cents >= ? AND created_at >= ? AND created_at < ?`,
      )
      .get(card.id, Math.ceil(0.8 * card.per_auth_cap_cents), hoursBefore(input.at, 24), input.at) as { n: number };
    if (near.n >= 1) {
      signals.push({
        id: "R5",
        label: "Possible split purchase",
        points: 25,
        evidence: `${near.n + 1} purchases at ≥ 80% of the cap on this card within 24 h`,
        data: { count: near.n + 1 },
      });
    }
  }

  const recent = db
    .prepare(`SELECT COUNT(*) n FROM authorization WHERE card_id=? AND created_at >= ? AND created_at < ?`)
    .get(card.id, new Date(new Date(input.at).getTime() - 10 * 60_000).toISOString(), input.at) as { n: number };
  if (recent.n >= 2) {
    signals.push({
      id: "R6",
      label: "High velocity",
      points: 20,
      evidence: `${recent.n + 1} attempts on this card within 10 minutes`,
    });
  }

  if (local.hour < 6) {
    signals.push({
      id: "R7",
      label: "Unusual hour",
      points: 10,
      evidence: `${local.time} local time (Dublin)`,
      data: { local_time: local.time },
    });
  }

  if (input.merchantCountry.toUpperCase() !== "IE" && event?.type !== "trip") {
    signals.push({
      id: "R8",
      label: "Foreign merchant",
      points: 15,
      evidence: `Merchant in ${input.merchantCountry.toUpperCase()} ${event ? "on a non-trip event" : "outside an event"}`,
    });
  }

  const dup = db
    .prepare(
      `SELECT COUNT(*) n FROM authorization WHERE society_id=? AND lower(merchant_name)=lower(?) AND amount_cents=? AND created_at >= ? AND created_at < ?`,
    )
    .get(societyId, input.merchantName, amount, hoursBefore(input.at, 24), input.at) as { n: number };
  if (dup.n >= 1) {
    signals.push({
      id: "R9",
      label: "Possible duplicate",
      points: 20,
      evidence: `Same merchant and amount (${fmtEur(amount)}) within 24 h`,
    });
  }

  const purchaser = db
    .prepare(
      `SELECT COUNT(*) total, SUM(CASE WHEN mcc_group=? THEN 1 ELSE 0 END) same FROM authorization
       WHERE member_id=? AND decision='approved' AND created_at < ?`,
    )
    .get(mcc.group, card.member_id, input.at) as { total: number; same: number | null };
  if (purchaser.total >= 3 && !purchaser.same) {
    signals.push({
      id: "R10",
      label: "Purchaser pattern break",
      points: 10,
      evidence: `Purchaser has ${purchaser.total} prior purchases, none in ${mcc.group}`,
      data: { prior: purchaser.total },
    });
  }

  if (amount >= 10_000 && amount % 5_000 === 0) {
    signals.push({ id: "R11", label: "Round large amount", points: 5, evidence: `${fmtEur(amount)} is a round amount` });
  }

  // Defence in depth for prompt injection (test F7): merchants control their own descriptor,
  // and instruction-like text there is suspicious whether or not the AI is available.
  if (INJECTION_PATTERN.test(input.merchantName)) {
    signals.push({
      id: "R13",
      label: "Instruction-like merchant descriptor",
      points: 40,
      evidence: "Merchant name contains instruction-like text (possible attempt to manipulate automated review)",
    });
  }

  if (member.cardholder_created_at) {
    const ageDays = (new Date(input.at).getTime() - new Date(member.cardholder_created_at).getTime()) / 86400_000;
    if (ageDays < 7) {
      signals.push({
        id: "R12",
        label: "New cardholder",
        points: 5,
        evidence: `Cardholder created ${Math.max(0, Math.floor(ageDays))} day(s) ago`,
      });
    }
  }

  return signals;
}

const HARD_CODES: Record<string, string> = {
  H1: "card_inactive",
  H2: "outside_event_window",
  H3: "insufficient_budget",
  H4: "blocked_mcc",
  H5: "spending_controls",
  H6: "spending_controls",
  H7: "blocked_card_profile",
};

/**
 * Decide and record an authorisation atomically. The whole thing runs inside an
 * IMMEDIATE transaction so concurrent authorisations can't both spend the same
 * remaining budget (test F9).
 */
export function decideAuthorization(input: PurchaseInput): Decision {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || !Number.isFinite(Date.parse(input.at))) throw new UserError("validation", "A purchase needs a positive amount in cents and a valid timestamp.");
  const t0 = performance.now();
  const db = getDb();

  const run = db.transaction((): Decision => {
    if (input.stripeAuthId) {
      const existing = db
        .prepare(`SELECT * FROM authorization WHERE stripe_auth_id=?`)
        .get(input.stripeAuthId) as { id: string; decision: string; decline_reason: string | null; rules_score: number; rule_signals: string } | undefined;
      if (existing) {
        return {
          authorizationId: existing.id,
          approved: existing.decision === "approved",
          declineReason: existing.decline_reason,
          declineCode: null,
          score: existing.rules_score,
          signals: JSON.parse(existing.rule_signals),
          decisionMs: 0,
        };
      }
    }

    const card = db.prepare(`SELECT * FROM card WHERE id=?`).get(input.cardId) as CardRow | undefined;
    if (!card) {
      return {
        authorizationId: null,
        approved: false,
        declineReason: "Unknown card",
        declineCode: "unknown_card",
        score: 0,
        signals: [],
        decisionMs: performance.now() - t0,
      };
    }
    const eventId = input.eventId !== undefined ? input.eventId : card.event_id;
    const event = eventId ? ((db.prepare(`SELECT * FROM event WHERE id=? AND society_id=?`).get(eventId, card.society_id) as EventRow | undefined) ?? null) : null;
    const member = db.prepare(`SELECT id, cardholder_created_at FROM member WHERE id=?`).get(card.member_id) as {
      id: string;
      cardholder_created_at: string | null;
    };

    const signals = computeSignals(input, card, event, member);
    const hard = signals.filter((s) => s.hard);
    const score = Math.min(100, signals.reduce((s, x) => s + x.points, 0));

    let approved = true;
    let declineReason: string | null = null;
    let declineCode: string | null = null;
    if (hard.length) {
      approved = false;
      declineReason = hard[0].evidence;
      declineCode = HARD_CODES[hard[0].id];
    }

    const id = newId("auth");
    const decisionMs = performance.now() - t0;
    db.prepare(
      `INSERT INTO authorization (id, stripe_auth_id, card_id, event_id, society_id, member_id, amount_cents, merchant_name, mcc, mcc_group,
        merchant_city, merchant_country, created_at, decision, decline_reason, rules_score, rule_signals, status, decision_ms, source)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.stripeAuthId ?? null,
      card.id,
      event?.id ?? null,
      card.society_id,
      card.member_id,
      input.amountCents,
      input.merchantName,
      input.mcc,
      mccInfo(input.mcc).group,
      input.merchantCity ?? "",
      input.merchantCountry.toUpperCase(),
      input.at,
      approved ? "approved" : "declined",
      declineReason,
      score,
      JSON.stringify(signals),
      approved ? "pending" : "declined",
      decisionMs,
      input.source ?? "live",
    );
    const key = merchantKey(input.merchantName,input.mcc,input.merchantCountry,input.merchantId);
    const currency = (input.currency ?? "eur").toLowerCase();
    db.prepare(`UPDATE authorization SET merchant_key=?,currency=? WHERE id=?`).run(key,currency,id);

    if (approved) {
      const exceptions=signals.filter(s=>["H2","H5","H6","E1","R1","R5","R6","R8","R9","R13"].includes(s.id));
      recordPaymentReview({ id,societyId:card.society_id,memberId:card.member_id,key,amount:input.amountCents,currency,at:input.at,exception:exceptions.length>0 || score>=SCORE_FLAG,reason:exceptions.map(s=>s.evidence).join("; ") });
      postEntry({
        societyId: card.society_id,
        eventId: event?.id ?? null,
        type: "auth_hold",
        amountCents: input.amountCents,
        refType: "authorization",
        refId: id,
        memo: input.merchantName,
        at: input.at,
      });
    }

    return { authorizationId: id, approved, declineReason, declineCode, score, signals, decisionMs };
  });

  return run.immediate();
}

/** Merchant captured (S2): convert hold → spend. Captured amount may differ from the hold. */
export function captureAuthorization(authId: string, amountCents?: number, at?: string, stripeTxnId?: string) {
  const db = getDb();
  return db
    .transaction(() => {
      if (stripeTxnId) {
        const seen = db.prepare(`SELECT id FROM txn WHERE stripe_txn_id=?`).get(stripeTxnId);
        if (seen) return false;
      }
      const a = db.prepare(`SELECT * FROM authorization WHERE id=?`).get(authId) as
        | { id: string; society_id: string; event_id: string | null; amount_cents: number; status: string; mcc_group: string; merchant_name: string }
        | undefined;
      if (!a || a.status !== "pending") return false;
      const amt = amountCents ?? a.amount_cents;
      const when = at ?? new Date().toISOString();
      postEntry({ societyId: a.society_id, eventId: a.event_id, type: "hold_release", amountCents: a.amount_cents, refType: "authorization", refId: a.id, at: when });
      postEntry({ societyId: a.society_id, eventId: a.event_id, type: "spend", amountCents: amt, refType: "authorization", refId: a.id, memo: a.merchant_name, at: when });
      db.prepare(`INSERT INTO txn (id, stripe_txn_id, authorization_id, amount_cents, type, created_at) VALUES (?,?,?,?,?,?)`).run(
        newId("txn"),
        stripeTxnId ?? null,
        a.id,
        amt,
        "capture",
        when,
      );
      db.prepare(`UPDATE authorization SET status='closed', captured_cents=? WHERE id=?`).run(amt, a.id);
      refreshStats(a.society_id, a.mcc_group);
      return true;
    })
    .immediate();
}

/** Reversal or expiry: release the hold back to the society. */
export function releaseAuthorization(authId: string, at?: string, reason: "reversed" | "expired" = "reversed") {
  const db = getDb();
  return db
    .transaction(() => {
      const a = db.prepare(`SELECT * FROM authorization WHERE id=?`).get(authId) as
        | { id: string; society_id: string; event_id: string | null; amount_cents: number; status: string }
        | undefined;
      if (!a || a.status !== "pending") return false;
      postEntry({
        societyId: a.society_id,
        eventId: a.event_id,
        type: "hold_release",
        amountCents: a.amount_cents,
        refType: "authorization",
        refId: a.id,
        memo: reason,
        at: at ?? new Date().toISOString(),
      });
      db.prepare(`UPDATE authorization SET status='reversed' WHERE id=?`).run(a.id);
      return true;
    })
    .immediate();
}

function statsFor(values: number[]) {
  const logs = values.map((v) => Math.log(v));
  const n = logs.length;
  const mean = logs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(logs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor((n - 1) / 2)];
  return { n, mean, sd, median };
}

/** Keep the precomputed stats table fresh so the sync path stays a single indexed read. */
export function refreshStats(societyId: string, group: string) {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO society_mcc_stats (society_id, mcc_group, n, mean_log, sd_log, median_cents) VALUES (?,?,?,?,?,?)`,
  );
  const soc = (
    db.prepare(`SELECT captured_cents v FROM authorization WHERE society_id=? AND mcc_group=? AND captured_cents > 0`).all(societyId, group) as { v: number }[]
  ).map((r) => r.v);
  if (soc.length) {
    const s = statsFor(soc);
    upsert.run(societyId, group, s.n, s.mean, s.sd, s.median);
  }
  const all = (
    db.prepare(`SELECT captured_cents v FROM authorization WHERE mcc_group=? AND captured_cents > 0`).all(group) as { v: number }[]
  ).map((r) => r.v);
  if (all.length) {
    const s = statsFor(all);
    upsert.run("__global__", group, s.n, s.mean, s.sd, s.median);
  }
}
