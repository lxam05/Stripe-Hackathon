import { getDb } from "./db";
import { committedToOpenEvents, eventRemaining, societyBalances } from "./ledger";
import type { Signal } from "./authorize";

export interface SocietyRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  blurb: string;
  icon: string;
  plan_status: "none" | "active" | "expired";
  plan_renews_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface EventRow {
  id: string;
  society_id: string;
  name: string;
  type: string;
  start_date: string;
  end_date: string;
  expected_attendees: number;
  budget_cents: number;
  status: "open" | "closed";
  notes: string;
  created_at: string;
}

export interface CardRow {
  id: string;
  event_id: string;
  member_id: string;
  network: string;
  stripe_card_id: string | null;
  last4: string;
  exp_month: number;
  exp_year: number;
  status: "pending" | "active" | "inactive" | "canceled";
  status_reason: string | null;
  per_auth_cap_cents: number;
  error: string | null;
  created_at: string;
  holder_name?: string;
}

export interface TxnRow {
  id: string;
  card_id: string;
  event_id: string;
  society_id: string;
  member_id: string;
  amount_cents: number;
  captured_cents: number;
  merchant_name: string;
  mcc: string;
  merchant_city: string;
  merchant_country: string;
  created_at: string;
  decision: "approved" | "declined";
  decline_reason: string | null;
  rules_score: number;
  rule_signals: string;
  status: string;
  decision_ms: number;
  source: string;
  event_name: string;
  event_type: string;
  member_name: string;
  society_name: string;
  ra_source: string | null;
  ra_status: string | null;
  ra_level: string | null;
  ra_summary: string | null;
  flag_id: string | null;
  flag_status: string | null;
  flag_severity: string | null;
}

const TXN_SELECT = `
  SELECT a.*, e.name event_name, e.type event_type, m.name member_name, s.name society_name,
    ra.source ra_source, ra.status ra_status, ra.risk_level ra_level, ra.summary ra_summary,
    f.id flag_id, f.status flag_status, f.severity flag_severity
  FROM authorization a
  JOIN event e ON e.id=a.event_id
  JOIN member m ON m.id=a.member_id
  JOIN society s ON s.id=a.society_id
  LEFT JOIN risk_assessment ra ON ra.id = (SELECT id FROM risk_assessment WHERE authorization_id=a.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
  LEFT JOIN flag f ON f.authorization_id=a.id
`;

export const getSociety = (id: string) => getDb().prepare(`SELECT * FROM society WHERE id=?`).get(id) as SocietyRow | undefined;
export const getSocietyBySlug = (slug: string) =>
  getDb().prepare(`SELECT * FROM society WHERE slug=?`).get(slug) as SocietyRow | undefined;
export const listSocieties = () => getDb().prepare(`SELECT * FROM society ORDER BY name`).all() as SocietyRow[];

export function listMembers(societyId?: string) {
  return getDb()
    .prepare(
      `SELECT m.*, s.name society_name, s.slug society_slug, s.icon society_icon FROM member m JOIN society s ON s.id=m.society_id
       ${societyId ? "WHERE m.society_id=?" : ""} ORDER BY s.name, CASE m.role WHEN 'treasurer' THEN 0 WHEN 'events_officer' THEN 1 ELSE 2 END`,
    )
    .all(...(societyId ? [societyId] : [])) as {
    id: string;
    name: string;
    role: string;
    email: string;
    member_ref: string;
    society_id: string;
    society_name: string;
    society_slug: string;
    society_icon: string;
  }[];
}

export function societyOverview(societyId: string) {
  const b = societyBalances(societyId);
  const committed = committedToOpenEvents(societyId);
  const db = getDb();
  const openFlags = db
    .prepare(`SELECT COUNT(*) n FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE a.society_id=? AND f.status IN ('open','receipt_requested')`)
    .get(societyId) as { n: number };
  const termStart = "2026-09-01T00:00:00Z";
  const termSpend = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type='spend' THEN amount_cents WHEN type='refund' THEN -amount_cents END),0) v FROM ledger_entry WHERE society_id=? AND created_at >= ?`,
    )
    .get(societyId, termStart) as { v: number };
  return { ...b, committed, unallocated: b.available - committed, openFlags: openFlags.n, termSpent: termSpend.v };
}

export function listEvents(societyId: string, status?: "open" | "closed") {
  const rows = getDb()
    .prepare(`SELECT * FROM event WHERE society_id=? ${status ? "AND status=?" : ""} ORDER BY start_date DESC`)
    .all(...(status ? [societyId, status] : [societyId])) as EventRow[];
  return rows.map((e) => ({ ...e, ...eventRemaining(e.id, e.budget_cents), card: currentCard(e.id) }));
}

export function getEvent(id: string) {
  const e = getDb().prepare(`SELECT * FROM event WHERE id=?`).get(id) as EventRow | undefined;
  if (!e) return null;
  return { ...e, ...eventRemaining(e.id, e.budget_cents), card: currentCard(e.id) };
}

export function currentCard(eventId: string) {
  return getDb()
    .prepare(
      `SELECT c.*, m.name holder_name FROM card c JOIN member m ON m.id=c.member_id WHERE c.event_id=? ORDER BY c.created_at DESC, c.rowid DESC LIMIT 1`,
    )
    .get(eventId) as CardRow | undefined;
}

export function listTransactions(opts: { societyId?: string; eventId?: string; limit?: number; flaggedOnly?: boolean; q?: string }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.societyId) {
    where.push("a.society_id=?");
    args.push(opts.societyId);
  }
  if (opts.eventId) {
    where.push("a.event_id=?");
    args.push(opts.eventId);
  }
  if (opts.flaggedOnly) where.push("f.id IS NOT NULL");
  if (opts.q) {
    where.push("(a.merchant_name LIKE ? OR e.name LIKE ? OR a.mcc LIKE ?)");
    args.push(`%${opts.q}%`, `%${opts.q}%`, `%${opts.q}%`);
  }
  return getDb()
    .prepare(`${TXN_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.created_at DESC LIMIT ?`)
    .all(...args, opts.limit ?? 50) as TxnRow[];
}

export function getTransaction(id: string) {
  return getDb().prepare(`${TXN_SELECT} WHERE a.id=?`).get(id) as TxnRow | undefined;
}

export interface AssessmentRow {
  id: string;
  source: "jev" | "rules_fallback";
  status: string;
  model: string | null;
  prompt_version: string | null;
  risk_score: number | null;
  risk_level: "low" | "medium" | "high" | null;
  flags: string;
  summary: string;
  recommended_action: string | null;
  questions: string;
  confidence: number | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  fallback_reason: string | null;
  action_taken: string | null;
  created_at: string;
}

export function latestAssessment(authId: string) {
  return getDb()
    .prepare(`SELECT * FROM risk_assessment WHERE authorization_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .get(authId) as AssessmentRow | undefined;
}

export function comparablePurchases(t: TxnRow) {
  return getDb()
    .prepare(
      `SELECT a.id, a.amount_cents, a.merchant_name, a.created_at, e.name event_name FROM authorization a JOIN event e ON e.id=a.event_id
       WHERE a.society_id=? AND a.mcc_group=(SELECT mcc_group FROM authorization WHERE id=?) AND a.id != ? AND a.decision='approved'
       ORDER BY a.created_at DESC LIMIT 5`,
    )
    .all(t.society_id, t.id, t.id) as { id: string; amount_cents: number; merchant_name: string; created_at: string; event_name: string }[];
}

export function signalsOf(t: { rule_signals: string }) {
  return JSON.parse(t.rule_signals) as Signal[];
}

export interface FlagRow extends TxnRow {
  f_id: string;
  f_severity: "low" | "medium" | "high";
  f_status: string;
  f_reason: string;
  f_card_frozen: number;
  f_created_at: string;
  f_resolution_note: string | null;
  f_resolved_at: string | null;
  card_status: string;
}

export function listFlags(opts: { societyId?: string; status?: "open" | "resolved" | "all" }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.societyId) {
    where.push("a.society_id=?");
    args.push(opts.societyId);
  }
  if (opts.status === "open" || !opts.status) where.push("f.status IN ('open','receipt_requested')");
  if (opts.status === "resolved") where.push("f.status IN ('legit','fraud')");
  return getDb()
    .prepare(
      `SELECT a.*, e.name event_name, e.type event_type, m.name member_name, s.name society_name,
         ra.source ra_source, ra.status ra_status, ra.risk_level ra_level, ra.summary ra_summary,
         f.id f_id, f.severity f_severity, f.status f_status, f.reason f_reason, f.card_frozen f_card_frozen, f.created_at f_created_at,
         f.resolution_note f_resolution_note, f.resolved_at f_resolved_at, c.status card_status
       FROM flag f JOIN authorization a ON a.id=f.authorization_id JOIN event e ON e.id=a.event_id JOIN member m ON m.id=a.member_id
       JOIN society s ON s.id=a.society_id JOIN card c ON c.id=a.card_id
       LEFT JOIN risk_assessment ra ON ra.id = (SELECT id FROM risk_assessment WHERE authorization_id=a.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY ${opts.status === "resolved" ? "f.resolved_at DESC" : "CASE f.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, f.created_at ASC"}
       LIMIT 100`,
    )
    .all(...args) as FlagRow[];
}

export function openFlagCount(societyId?: string) {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) n FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.status IN ('open','receipt_requested') ${societyId ? "AND a.society_id=?" : ""}`,
    )
    .get(...(societyId ? [societyId] : [])) as { n: number };
  return r.n;
}

export function monthlySpend(societyId: string) {
  return getDb()
    .prepare(
      `SELECT substr(created_at,1,7) month, SUM(CASE WHEN type='spend' THEN amount_cents ELSE -amount_cents END) cents
       FROM ledger_entry WHERE society_id=? AND type IN ('spend','refund') AND created_at >= '2025-09-01'
       GROUP BY 1 ORDER BY 1`,
    )
    .all(societyId) as { month: string; cents: number }[];
}

export function listTopUps(societyId: string, limit = 20) {
  return getDb()
    .prepare(`SELECT * FROM topup WHERE society_id=? AND status='paid' ORDER BY paid_at DESC LIMIT ?`)
    .all(societyId, limit) as {
    id: string;
    payer_type: string;
    payer_name: string;
    message: string;
    show_publicly: number;
    amount_cents: number;
    paid_at: string;
    checkout_session_id: string;
  }[];
}

export function listAudit(limit = 30) {
  return getDb()
    .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
    .all(limit) as { id: number; actor: string; action: string; target: string; details: string; at: string }[];
}

export function activeCards(societyId?: string) {
  return getDb()
    .prepare(
      `SELECT c.*, m.name holder_name, e.name event_name, e.type event_type, s.name society_name, s.slug society_slug
       FROM card c JOIN event e ON e.id=c.event_id JOIN member m ON m.id=c.member_id JOIN society s ON s.id=e.society_id
       WHERE c.status IN ('active','inactive') AND e.status='open' ${societyId ? "AND e.society_id=?" : ""}
       ORDER BY s.name, e.start_date`,
    )
    .all(...(societyId ? [societyId] : [])) as (CardRow & { event_name: string; event_type: string; society_name: string; society_slug: string })[];
}
