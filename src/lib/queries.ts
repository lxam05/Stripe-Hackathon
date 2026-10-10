import { getDb } from "./db";
import { cardMonthSpend } from "./cards";
import { committedToOpenEvents, eventRemaining, societyBalances } from "./ledger";
import { ROLE_ORDER } from "./roles";
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
  society_id: string;
  event_id: string | null;
  member_id: string;
  network: string;
  stripe_card_id: string | null;
  last4: string;
  exp_month: number;
  exp_year: number;
  status: "pending" | "active" | "inactive" | "canceled";
  status_reason: string | null;
  per_auth_cap_cents: number;
  monthly_limit_cents: number;
  error: string | null;
  created_at: string;
}

/** A card with its holder and the event it's currently spending for. */
export interface OfficerCard extends CardRow {
  holder_name: string;
  holder_role: string;
  event_name: string | null;
  event_type: string | null;
  event_status: string | null;
  month_spent: number;
}

export interface TxnRow {
  id: string;
  card_id: string;
  event_id: string | null;
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
  /** "General spending" when the purchase wasn't tied to an event. */
  event_name: string;
  event_type: string;
  member_name: string;
  card_last4: string;
  society_name: string;
  ra_source: string | null;
  ra_status: string | null;
  ra_level: string | null;
  ra_summary: string | null;
  flag_id: string | null;
  flag_status: string | null;
  flag_severity: string | null;
}

export const GENERAL_SPENDING = "General spending";
const EVENT_COLS = `COALESCE(e.name, '${GENERAL_SPENDING}') event_name, COALESCE(e.type, 'general') event_type`;

const TXN_SELECT = `
  SELECT a.*, ${EVENT_COLS}, m.name member_name, c.last4 card_last4, s.name society_name,
    ra.source ra_source, ra.status ra_status, ra.risk_level ra_level, ra.summary ra_summary,
    f.id flag_id, f.status flag_status, f.severity flag_severity
  FROM authorization a
  LEFT JOIN event e ON e.id=a.event_id
  JOIN card c ON c.id=a.card_id
  JOIN member m ON m.id=a.member_id
  JOIN society s ON s.id=a.society_id
  LEFT JOIN risk_assessment ra ON ra.id = (SELECT id FROM risk_assessment WHERE authorization_id=a.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
  LEFT JOIN flag f ON f.authorization_id=a.id
`;

export const getSociety = (id: string) => getDb().prepare(`SELECT * FROM society WHERE id=?`).get(id) as SocietyRow | undefined;
export const getSocietyBySlug = (slug: string) =>
  getDb().prepare(`SELECT * FROM society WHERE slug=?`).get(slug) as SocietyRow | undefined;
export const listSocieties = () => getDb().prepare(`SELECT * FROM society ORDER BY name`).all() as SocietyRow[];

const ROLE_SQL = `CASE m.role ${Object.entries(ROLE_ORDER).map(([r, i]) => `WHEN '${r}' THEN ${i}`).join(" ")} ELSE 9 END`;

export function listMembers(societyId?: string) {
  return getDb()
    .prepare(
      `SELECT m.*, s.name society_name, s.slug society_slug, s.icon society_icon FROM member m JOIN society s ON s.id=m.society_id
       ${societyId ? "WHERE m.society_id=?" : ""} ORDER BY s.name, ${ROLE_SQL}`,
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
  return rows.map((e) => ({ ...e, ...eventRemaining(e.id, e.budget_cents), cards: e.status === "open" ? listCards({ eventId: e.id }) : [] }));
}

export function getEvent(id: string) {
  const e = getDb().prepare(`SELECT * FROM event WHERE id=?`).get(id) as EventRow | undefined;
  if (!e) return null;
  return { ...e, ...eventRemaining(e.id, e.budget_cents), cards: listCards({ eventId: e.id }) };
}

/**
 * Officer cards with holder, current event and this month's spend, in committee order.
 * Cancelled cards are left out unless `includeCanceled` (they still show in history).
 */
export function listCards(opts: { societyId?: string; eventId?: string; usable?: boolean; includeCanceled?: boolean }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts.societyId) {
    where.push("c.society_id=?");
    args.push(opts.societyId);
  }
  if (opts.eventId) {
    where.push("c.event_id=?");
    args.push(opts.eventId);
  }
  if (opts.usable) where.push("c.status IN ('active','inactive')");
  else if (!opts.includeCanceled) where.push("c.status != 'canceled'");
  const rows = getDb()
    .prepare(
      `SELECT c.*, m.name holder_name, m.role holder_role, e.name event_name, e.type event_type, e.status event_status
       FROM card c JOIN member m ON m.id=c.member_id LEFT JOIN event e ON e.id=c.event_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY c.society_id, ${ROLE_SQL}, c.created_at DESC`,
    )
    .all(...args) as Omit<OfficerCard, "month_spent">[];
  const now = new Date().toISOString();
  return rows.map((c) => ({ ...c, month_spent: cardMonthSpend(c.id, now) }));
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
      `SELECT a.id, a.amount_cents, a.merchant_name, a.created_at, ${EVENT_COLS} FROM authorization a LEFT JOIN event e ON e.id=a.event_id
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
      `SELECT a.*, ${EVENT_COLS}, m.name member_name, c.last4 card_last4, s.name society_name,
         ra.source ra_source, ra.status ra_status, ra.risk_level ra_level, ra.summary ra_summary,
         f.id f_id, f.severity f_severity, f.status f_status, f.reason f_reason, f.card_frozen f_card_frozen, f.created_at f_created_at,
         f.resolution_note f_resolution_note, f.resolved_at f_resolved_at, c.status card_status
       FROM flag f JOIN authorization a ON a.id=f.authorization_id LEFT JOIN event e ON e.id=a.event_id JOIN member m ON m.id=a.member_id
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

/** Cards the purchase simulator can charge: live cards with their society and remaining money. */
export function simulatorCards(societyId?: string) {
  const db = getDb();
  return listCards({ societyId, usable: true }).map((c) => {
    const soc = db.prepare(`SELECT name, slug FROM society WHERE id=?`).get(c.society_id) as { name: string; slug: string };
    const onEvent = c.event_id && c.event_status === "open";
    const ev = onEvent ? (db.prepare(`SELECT budget_cents FROM event WHERE id=?`).get(c.event_id) as { budget_cents: number }) : null;
    const remaining = ev ? eventRemaining(c.event_id!, ev.budget_cents).remaining : societyBalances(c.society_id).available;
    return { ...c, society_name: soc.name, society_slug: soc.slug, remaining };
  });
}
