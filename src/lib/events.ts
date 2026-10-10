import { audit, getDb, newId, nowIso } from "./db";
import { assignCard, setCardStatus } from "./cards";
import { committedToOpenEvents, eventRemaining, societyBalances } from "./ledger";
import { EVENT_TYPES, type EventType } from "./mcc";
import { fmtEur } from "./money";
import { UserError } from "./errors";

export interface NewEventInput {
  societyId: string;
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
  expectedAttendees: number;
  budgetCents: number;
  /** Officer cards that should spend for this event from now on. */
  cardIds?: string[];
  notes?: string;
}

export function validateEvent(input: NewEventInput) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Give the event a name.";
  if (input.name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!EVENT_TYPES.some((t) => t.value === input.type)) errors.type = "Pick an event type.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) errors.startDate = "Pick a start date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) errors.endDate = "Pick an end date.";
  else if (input.endDate < input.startDate) errors.endDate = "The end date can't be before the start date.";
  if (!Number.isInteger(input.budgetCents) || input.budgetCents < 100) errors.budget = "The budget must be at least €1.";
  if (input.budgetCents > 5_000_000) errors.budget = "Budgets over €50,000 need the Societies Office.";
  if (!Number.isInteger(input.expectedAttendees) || input.expectedAttendees < 0) errors.expectedAttendees = "Enter a number of attendees.";
  return errors;
}

export function budgetWarning(societyId: string, budgetCents: number): string | null {
  const unallocated = societyBalances(societyId).available - committedToOpenEvents(societyId);
  return budgetCents > unallocated
    ? `This budget is more than the society's unallocated money (${fmtEur(Math.max(0, unallocated))}). The event will be created, but purchases are declined once the society runs out.`
    : null;
}

/** Create an event budget and point the chosen officer cards at it. */
export function createEvent(input: NewEventInput, actor: string) {
  const db = getDb();
  const errors = validateEvent(input);
  if (Object.keys(errors).length) throw new UserError("validation", Object.values(errors)[0]);
  const soc = db.prepare(`SELECT id FROM society WHERE id=?`).get(input.societyId);
  if (!soc) throw new UserError("unknown_society", "Society not found", 404);
  const cardIds = [...new Set(input.cardIds ?? [])];
  for (const id of cardIds) {
    const c = db.prepare(`SELECT society_id, status FROM card WHERE id=?`).get(id) as { society_id: string; status: string } | undefined;
    if (!c || c.society_id !== input.societyId || c.status === "canceled") throw new UserError("validation", "Pick cards from your society's live officer cards.");
  }

  const eventId = newId("evt");
  db.prepare(
    `INSERT INTO event (id, society_id, name, type, start_date, end_date, expected_attendees, budget_cents, status, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(eventId, input.societyId, input.name.trim(), input.type, input.startDate, input.endDate, input.expectedAttendees, input.budgetCents, "open", (input.notes ?? "").trim().slice(0, 500), nowIso());
  audit(actor, "event.created", eventId, { budget_cents: input.budgetCents });
  for (const id of cardIds) assignCard(id, eventId, actor);
  return { eventId };
}

/** Close an event: its cards go back to general spending; unspent budget returns to the pool. */
export function closeEvent(eventId: string, actor: string) {
  const db = getDb();
  const ev = db.prepare(`SELECT * FROM event WHERE id=?`).get(eventId) as { id: string; status: string; budget_cents: number } | undefined;
  if (!ev) throw new UserError("not_found", "Event not found", 404);
  if (ev.status === "closed") return;
  const cards = db.prepare(`SELECT id FROM card WHERE event_id=?`).all(eventId) as { id: string }[];
  for (const c of cards) assignCard(c.id, null, actor);
  db.prepare(`UPDATE event SET status='closed' WHERE id=?`).run(eventId);
  const remaining = eventRemaining(eventId, ev.budget_cents).remaining;
  audit(actor, "event.closed", eventId, { returned_to_pool_cents: remaining });
}

export type Resolution = "legit" | "receipt_requested" | "fraud";

export async function resolveFlag(flagId: string, resolution: Resolution, note: string, actor: string, opts: { unfreeze?: boolean; reverse?: boolean } = {}) {
  const db = getDb();
  const f = db
    .prepare(`SELECT f.*, a.card_id, a.id auth_id, a.status auth_status FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.id=?`)
    .get(flagId) as { id: string; status: string; card_id: string; auth_id: string; auth_status: string; card_frozen: number } | undefined;
  if (!f) throw new UserError("not_found", "Flag not found", 404);
  if (!["legit", "receipt_requested", "fraud"].includes(resolution)) throw new UserError("validation", "Unknown resolution");

  db.prepare(`UPDATE flag SET status=?, resolution_note=?, resolved_by=?, resolved_at=? WHERE id=?`).run(
    resolution,
    note.trim().slice(0, 500) || null,
    actor,
    resolution === "receipt_requested" ? null : nowIso(),
    flagId,
  );
  audit(actor, `flag.${resolution}`, flagId, { note });

  const card = db.prepare(`SELECT status FROM card WHERE id=?`).get(f.card_id) as { status: string };
  if (resolution === "fraud") {
    if (card.status !== "canceled") await setCardStatus(f.card_id, "canceled", "Cancelled by treasurer: misuse confirmed", actor);
    // A treasurer review cannot undo a network payment. Recovery is tracked separately.
  }
  if (resolution === "legit" && opts.unfreeze && card.status === "inactive") {
    await setCardStatus(f.card_id, "active", "Unfrozen by treasurer after review", actor);
  }
}
