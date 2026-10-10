import { getDb, newId, nowIso } from "./db";
import { actionPolicy } from "./assess";
import { SCORE_FLAG, type Signal } from "./authorize";
import { env, jevEnabled } from "./env";
import { buildContext, callJev, type JevOutput } from "./jev";

// PRD §11.3: does JEV add value over rules? Runs the labelled eval set (30% of
// the 2025/26 synthetic purchases) through three configurations.

interface EvalAuth {
  id: string;
  card_id: string;
  amount_cents: number;
  decision: string;
  decline_reason: string | null;
  rules_score: number;
  rule_signals: string;
  merchant_name: string;
  decision_ms: number;
  created_at: string;
  society_id: string;
  is_anomaly: number;
  anomaly_type: string | null;
}

export function evalSet() {
  return getDb()
    .prepare(
      `SELECT a.*, l.is_anomaly, l.anomaly_type FROM authorization a JOIN synthetic_label l ON l.authorization_id=a.id WHERE l.eval_set=1 ORDER BY a.created_at`,
    )
    .all() as EvalAuth[];
}

export interface Metrics {
  config: string;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falseFlagsPerSocietyMonth: number | null;
  p95LatencyMs: number | null;
  costPer100Usd: number | null;
  n: number;
}

function metrics(config: string, rows: { pred: boolean; truth: boolean }[], latencies: number[], cost: number | null, months: number, societies: number, sampleFrac: number): Metrics {
  const tp = rows.filter((r) => r.pred && r.truth).length;
  const fp = rows.filter((r) => r.pred && !r.truth).length;
  const fn = rows.filter((r) => !r.pred && r.truth).length;
  const tn = rows.filter((r) => !r.pred && !r.truth).length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision != null && recall != null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    config,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1,
    // Scale the sample back to the full year, then per society-month.
    falseFlagsPerSocietyMonth: rows.length ? fp / sampleFrac / (societies * months) : null,
    p95LatencyMs: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null,
    costPer100Usd: cost,
    n: rows.length,
  };
}

export function latestRun() {
  return getDb().prepare(`SELECT run_id, model, MIN(created_at) started, COUNT(*) n FROM eval_result GROUP BY run_id ORDER BY started DESC LIMIT 1`).get() as
    | { run_id: string; model: string; started: string; n: number }
    | undefined;
}

export function computeEval() {
  const db = getDb();
  const set = evalSet();
  const totalLabelled = (db.prepare(`SELECT COUNT(*) n FROM synthetic_label WHERE authorization_id IN (SELECT id FROM authorization WHERE created_at < '2026-09-01')`).get() as { n: number }).n;
  const sampleFrac = totalLabelled ? set.length / totalLabelled : 0.3;
  const societies = (db.prepare(`SELECT COUNT(*) n FROM society`).get() as { n: number }).n;
  const months = 12;

  const rulesPred = (a: EvalAuth) => a.decision === "declined" || a.rules_score >= SCORE_FLAG;
  const rules = metrics(
    "Rules only",
    set.map((a) => ({ pred: rulesPred(a), truth: !!a.is_anomaly })),
    set.map((a) => a.decision_ms),
    0,
    months,
    societies,
    sampleFrac,
  );

  const run = latestRun();
  let jev: Metrics | null = null;
  let combined: Metrics | null = null;
  const byType = new Map<string, { n: number; rules: number; jev: number; combined: number }>();
  let consistency: { cases: number; meanStdev: number; levelAgreement: number } | null = null;
  let samples: { id: string; merchant: string; amount: number; type: string | null; truth: boolean; level: string | null; summary: string | null }[] = [];
  let failures = 0;

  const results = run
    ? (db.prepare(`SELECT * FROM eval_result WHERE run_id=? AND repeat_idx=0`).all(run.run_id) as {
        authorization_id: string;
        risk_level: string | null;
        risk_score: number | null;
        recommended_action: string | null;
        summary: string | null;
        confidence: number | null;
        ok: number;
        latency_ms: number | null;
        cost_usd: number | null;
        model: string;
      }[])
    : [];
  const resById = new Map(results.map((r) => [r.authorization_id, r]));

  for (const a of set) {
    const key = a.is_anomaly ? (a.anomaly_type ?? "anomaly") : a.anomaly_type === "hard_negative" ? "hard_negative (legit)" : "normal (legit)";
    const t = byType.get(key) ?? { n: 0, rules: 0, jev: 0, combined: 0 };
    t.n++;
    if (rulesPred(a)) t.rules++;
    byType.set(key, t);
  }

  if (run && results.length) {
    const covered = set.filter((a) => resById.has(a.id));
    const jevRows: { pred: boolean; truth: boolean }[] = [];
    const combRows: { pred: boolean; truth: boolean }[] = [];
    for (const a of covered) {
      const r = resById.get(a.id)!;
      if (!r.ok) failures++;
      const out: JevOutput | null = r.ok
        ? ({ risk_level: r.risk_level, risk_score: r.risk_score, confidence: r.confidence ?? 1, flags: [], summary: r.summary, recommended_action: r.recommended_action, questions_for_purchaser: [] } as unknown as JevOutput)
        : null;
      const jevPred = r.ok ? r.risk_level === "medium" || r.risk_level === "high" : rulesPred(a);
      const pol = actionPolicy(a, JSON.parse(a.rule_signals) as Signal[], out);
      const combPred = a.decision === "declined" || pol.flag != null;
      jevRows.push({ pred: jevPred, truth: !!a.is_anomaly });
      combRows.push({ pred: combPred, truth: !!a.is_anomaly });
      const key = a.is_anomaly ? (a.anomaly_type ?? "anomaly") : a.anomaly_type === "hard_negative" ? "hard_negative (legit)" : "normal (legit)";
      const t = byType.get(key)!;
      if (jevPred) t.jev++;
      if (combPred) t.combined++;
    }
    const lat = results.filter((r) => r.ok && r.latency_ms != null).map((r) => r.latency_ms!);
    const costs = results.filter((r) => r.cost_usd != null).map((r) => r.cost_usd!);
    const per100 = costs.length ? (costs.reduce((s, c) => s + c, 0) / costs.length) * 100 : null;
    jev = metrics(`JEV only (${run.model.split("/").pop()})`, jevRows, lat, per100, months, societies, sampleFrac);
    combined = metrics("Combined (shipped policy)", combRows, lat, per100, months, societies, sampleFrac);

    const reps = db
      .prepare(`SELECT authorization_id, risk_score, risk_level FROM eval_result WHERE run_id=? AND ok=1 AND authorization_id IN (SELECT authorization_id FROM eval_result WHERE run_id=? AND repeat_idx>0)`)
      .all(run.run_id, run.run_id) as { authorization_id: string; risk_score: number; risk_level: string }[];
    if (reps.length) {
      const groups = new Map<string, { s: number[]; l: string[] }>();
      for (const r of reps) {
        const g = groups.get(r.authorization_id) ?? { s: [], l: [] };
        g.s.push(r.risk_score);
        g.l.push(r.risk_level);
        groups.set(r.authorization_id, g);
      }
      const sds = [...groups.values()].map((g) => {
        const m = g.s.reduce((x, y) => x + y, 0) / g.s.length;
        return Math.sqrt(g.s.reduce((x, y) => x + (y - m) ** 2, 0) / g.s.length);
      });
      const agree = [...groups.values()].filter((g) => new Set(g.l).size === 1).length;
      consistency = { cases: groups.size, meanStdev: sds.reduce((a, b) => a + b, 0) / sds.length, levelAgreement: agree / groups.size };
    }

    samples = set
      .filter((a) => resById.get(a.id)?.ok && (a.is_anomaly || a.anomaly_type === "hard_negative"))
      .slice(0, 40)
      .filter((_, i) => i % 4 === 0)
      .map((a) => ({
        id: a.id,
        merchant: a.merchant_name,
        amount: a.amount_cents,
        type: a.anomaly_type,
        truth: !!a.is_anomaly,
        level: resById.get(a.id)!.risk_level,
        summary: resById.get(a.id)!.summary,
      }));
  }

  return {
    set: { n: set.length, anomalies: set.filter((a) => a.is_anomaly).length, hardNegatives: set.filter((a) => a.anomaly_type === "hard_negative").length },
    rules,
    jev,
    combined,
    byType: [...byType.entries()].sort((a, b) => (a[0].includes("legit") ? 1 : 0) - (b[0].includes("legit") ? 1 : 0) || a[0].localeCompare(b[0])),
    consistency,
    samples,
    failures,
    run,
  };
}

// ── Runner (used by scripts/eval.ts and the Evaluation page button) ───────────
const g = globalThis as unknown as { __balanceEval?: { running: boolean; done: number; total: number; error?: string } };
export const evalProgress = () => g.__balanceEval ?? { running: false, done: 0, total: 0 };

export async function runEval(opts: { model?: string; repeats?: number; concurrency?: number; log?: (s: string) => void } = {}) {
  if (!jevEnabled()) throw new Error("OPENROUTER_API_KEY not configured");
  if (g.__balanceEval?.running) throw new Error("An evaluation is already running");
  const model = opts.model ?? env.jevModel;
  const set = evalSet();
  const repeatIds = set.filter((_, i) => i % Math.max(1, Math.floor(set.length / 20)) === 0).slice(0, 20).map((a) => a.id);
  const jobs: { id: string; rep: number }[] = [...set.map((a) => ({ id: a.id, rep: 0 }))];
  for (let r = 1; r <= (opts.repeats ?? 2); r++) for (const id of repeatIds) jobs.push({ id, rep: r });
  const runId = newId("run");
  g.__balanceEval = { running: true, done: 0, total: jobs.length };
  const ins = getDb().prepare(
    `INSERT INTO eval_result (run_id, config, authorization_id, model, risk_level, risk_score, recommended_action, summary, confidence, ok, latency_ms, cost_usd, repeat_idx, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      const res = await callJev(buildContext(job.id), model);
      if (res.ok) {
        ins.run(runId, "jev_only", job.id, res.model, res.output.risk_level, res.output.risk_score, res.output.recommended_action, res.output.summary, res.output.confidence, 1, res.latencyMs, res.costUsd ?? null, job.rep, nowIso());
      } else {
        ins.run(runId, "jev_only", job.id, model, null, null, null, res.reason, null, 0, res.latencyMs, null, job.rep, nowIso());
      }
      g.__balanceEval!.done++;
      opts.log?.(`${g.__balanceEval!.done}/${jobs.length} ${res.ok ? res.output.risk_level : "FAIL " + res.reason}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  } finally {
    g.__balanceEval!.running = false;
  }
  return runId;
}
