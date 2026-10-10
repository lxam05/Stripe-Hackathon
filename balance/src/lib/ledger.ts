import { getDb } from "./db";

// Append-only ledger (PRD §9.3). Balances are always derived from entries:
//   funded    = Σtopup + Σadjustment − Σtransfer_out
//   held      = Σauth_hold − Σhold_release
//   spent     = Σspend − Σrefund
//   available = funded − held − spent
// The per-society budget is enforced by Balance at authorisation time, on top of
// the single platform Issuing balance at Stripe.

export type LedgerType = "topup" | "adjustment" | "transfer_out" | "auth_hold" | "hold_release" | "spend" | "refund";

export interface Balances {
  funded: number;
  held: number;
  spent: number;
  available: number;
}

const SUMS = `
  COALESCE(SUM(CASE WHEN type IN ('topup','adjustment') THEN amount_cents WHEN type='transfer_out' THEN -amount_cents END),0) AS funded,
  COALESCE(SUM(CASE WHEN type='auth_hold' THEN amount_cents WHEN type='hold_release' THEN -amount_cents END),0) AS held,
  COALESCE(SUM(CASE WHEN type='spend' THEN amount_cents WHEN type='refund' THEN -amount_cents END),0) AS spent
`;

function finish(r: { funded: number; held: number; spent: number }): Balances {
  return { ...r, available: r.funded - r.held - r.spent };
}

export function societyBalances(societyId: string): Balances {
  const r = getDb()
    .prepare(`SELECT ${SUMS} FROM ledger_entry WHERE society_id = ?`)
    .get(societyId) as { funded: number; held: number; spent: number };
  return finish(r);
}

export function eventBalances(eventId: string) {
  const r = getDb()
    .prepare(`SELECT ${SUMS} FROM ledger_entry WHERE event_id = ?`)
    .get(eventId) as { funded: number; held: number; spent: number };
  return { held: r.held, spent: r.spent };
}

export function eventRemaining(eventId: string, budgetCents: number) {
  const b = eventBalances(eventId);
  return { ...b, remaining: budgetCents - b.held - b.spent };
}

/** Money still committed to open events' remaining budgets. */
export function committedToOpenEvents(societyId: string): number {
  const rows = getDb()
    .prepare(`SELECT id, budget_cents FROM event WHERE society_id = ? AND status = 'open'`)
    .all(societyId) as { id: string; budget_cents: number }[];
  return rows.reduce((s, e) => s + Math.max(0, eventRemaining(e.id, e.budget_cents).remaining), 0);
}

export function postEntry(e: {
  societyId: string;
  eventId?: string | null;
  type: LedgerType;
  amountCents: number;
  refType: string;
  refId: string;
  memo?: string;
  at: string;
}) {
  if (!Number.isInteger(e.amountCents) || e.amountCents < 0) {
    throw new Error(`Ledger amounts must be non-negative integer cents (got ${e.amountCents})`);
  }
  getDb()
    .prepare(
      `INSERT INTO ledger_entry (society_id, event_id, type, amount_cents, ref_type, ref_id, memo, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(e.societyId, e.eventId ?? null, e.type, e.amountCents, e.refType, e.refId, e.memo ?? "", e.at);
}

/** Invariant check used by tests and the admin page: no society may go negative. */
export function reconcileAll() {
  const socs = getDb().prepare(`SELECT id, name FROM society`).all() as { id: string; name: string }[];
  return socs.map((s) => {
    const b = societyBalances(s.id);
    const held = getDb()
      .prepare(
        `SELECT COALESCE(SUM(amount_cents),0) v FROM authorization WHERE society_id=? AND status='pending' AND decision='approved'`,
      )
      .get(s.id) as { v: number };
    return {
      ...s,
      ...b,
      ok: b.available >= 0 && b.held === held.v && b.held >= 0 && b.spent >= 0,
      pendingHolds: held.v,
    };
  });
}
