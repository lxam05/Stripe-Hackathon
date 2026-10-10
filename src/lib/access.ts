import { getDb } from "./db";
import type { Actor } from "./session";

// Who can see what. Three kinds of user:
//   Societies Office (admin) — every society.
//   Treasurer               — everything in their own society; the only member who manages money.
//   Officer (any other role) — their own card, their own purchases and flags, and the events
//                              their card spends for. Never other officers' cards or spending,
//                              and none of the society's funding, ledger or billing.

export const isAdmin = (a: Actor | null) => a?.kind === "admin";
export const isTreasurer = (a: Actor | null) => a?.kind === "member" && a.role === "treasurer";
export const isOfficer = (a: Actor | null) => a?.kind === "member" && a.role !== "treasurer";

/** Filters for list queries: everything (admin), one society (treasurer) or one member (officer). */
export function scopeOf(a: Actor): { societyId?: string; memberId?: string } {
  if (a.kind === "admin") return {};
  if (a.role === "treasurer") return { societyId: a.societyId };
  return { societyId: a.societyId, memberId: a.id };
}

/** Treasurer of this society, or the Societies Office. */
export function canManageSociety(a: Actor | null, societyId: string) {
  return a?.kind === "admin" || (a?.kind === "member" && a.role === "treasurer" && a.societyId === societyId);
}

/** A purchase (or a card) is visible to the Office, its society's treasurer, and the officer who holds the card. */
export function canSeeOwned(a: Actor | null, owner: { society_id: string; member_id: string } | undefined) {
  if (!a || !owner) return false;
  if (a.kind === "admin") return true;
  if (a.societyId !== owner.society_id) return false;
  return a.role === "treasurer" || a.id === owner.member_id;
}

export function authorizationOwner(authId: string) {
  return getDb().prepare(`SELECT society_id, member_id FROM authorization WHERE id=?`).get(authId) as { society_id: string; member_id: string } | undefined;
}

export function cardOwner(cardId: string) {
  return getDb().prepare(`SELECT society_id, member_id FROM card WHERE id=?`).get(cardId) as { society_id: string; member_id: string } | undefined;
}

export function flagOwner(flagId: string) {
  return getDb()
    .prepare(`SELECT a.society_id, a.member_id FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.id=?`)
    .get(flagId) as { society_id: string; member_id: string } | undefined;
}

export function eventSociety(eventId: string) {
  return (getDb().prepare(`SELECT society_id FROM event WHERE id=?`).get(eventId) as { society_id: string } | undefined)?.society_id;
}

/** Officers see an event only if their card spends for it, or they've bought something for it. */
export function canSeeEvent(a: Actor | null, eventId: string) {
  const societyId = eventSociety(eventId);
  if (!a || !societyId) return false;
  if (a.kind === "admin") return true;
  if (a.societyId !== societyId) return false;
  if (a.role === "treasurer") return true;
  const db = getDb();
  return Boolean(
    db.prepare(`SELECT 1 FROM card WHERE member_id=? AND event_id=?`).get(a.id, eventId) ||
      db.prepare(`SELECT 1 FROM authorization WHERE member_id=? AND event_id=?`).get(a.id, eventId),
  );
}
