import { getDb } from "./db";
import { UserError } from "./errors";
import type { Actor } from "./session";

// Who can see what:
//   Societies Council (admin) — oversight of every society; doesn't act on a society's money.
//   Treasurer                 — everything in their own society; the only member who manages money.
//   Senior treasurer          — sees everything in their society (read-only) and prepares grant reports.
//   Other members/officers    — their own card, their own purchases, expenses and reviews, and the
//                               events their card spends for. Never other people's cards or spending,
//                               and none of the society's funding, ledger or billing.

const FINANCE_ROLES = ["treasurer", "senior_treasurer"];

export const isAdmin = (a: Actor | null) => a?.kind === "admin";
export const isTreasurer = (a: Actor | null) => a?.kind === "member" && a.role === "treasurer";
/** Treasurer or senior treasurer: sees the whole society. */
export const isFinance = (a: Actor | null) => a?.kind === "member" && FINANCE_ROLES.includes(a.role);
/** Any other member: sees only their own card and spending. */
export const isOfficer = (a: Actor | null) => a?.kind === "member" && !FINANCE_ROLES.includes(a.role);

/** Filters for list queries: everything (Council), one society (finance) or one member (officer). */
export function scopeOf(a: Actor): { societyId?: string; memberId?: string } {
  if (a.kind === "admin") return {};
  if (FINANCE_ROLES.includes(a.role)) return { societyId: a.societyId };
  return { societyId: a.societyId, memberId: a.id };
}

/** Only the society's own treasurer acts on its cards, events, reviews and money. */
export function canManageSociety(a: Actor | null, societyId: string) {
  return a?.kind === "member" && a.role === "treasurer" && a.societyId === societyId;
}

/** A purchase (or a card) is visible to the Council, its society's finance roles, and the member who holds the card. */
export function canSeeOwned(a: Actor | null, owner: { society_id: string; member_id: string } | undefined) {
  if (!a || !owner) return false;
  if (a.kind === "admin") return true;
  if (a.societyId !== owner.society_id) return false;
  return FINANCE_ROLES.includes(a.role) || a.id === owner.member_id;
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
  if (FINANCE_ROLES.includes(a.role)) return true;
  const db = getDb();
  return Boolean(
    db.prepare(`SELECT 1 FROM card WHERE member_id=? AND event_id=?`).get(a.id, eventId) ||
      db.prepare(`SELECT 1 FROM authorization WHERE member_id=? AND event_id=?`).get(a.id, eventId),
  );
}

// ── Assertions for mutations (throw UserError, which API routes turn into 403/404) ──

export function assertSociety(actor: Actor | null, societyId: string) {
  if (!actor || (actor.kind === "member" && actor.societyId !== societyId)) throw new UserError("forbidden", "You cannot access this society.", 403);
}
export function assertTreasurer(actor: Actor | null, societyId: string) {
  assertSociety(actor, societyId);
  if (actor?.kind !== "member" || actor.role !== "treasurer") throw new UserError("forbidden", "Only this society's treasurer can do that.", 403);
}
export function assertCouncil(actor: Actor | null) {
  if (actor?.kind !== "admin") throw new UserError("forbidden", "Societies Council access required.", 403);
}
export function reportOwner(societyId: string) {
  return getDb().prepare(`SELECT id, name, role FROM member WHERE society_id=? AND role IN ('senior_treasurer','treasurer') ORDER BY CASE role WHEN 'senior_treasurer' THEN 0 ELSE 1 END LIMIT 1`).get(societyId) as { id: string; name: string; role: string };
}
export function assertReportOwner(actor: Actor | null, societyId: string) {
  assertSociety(actor, societyId);
  if (actor?.kind !== "member" || actor.id !== reportOwner(societyId)?.id) throw new UserError("forbidden", "The senior treasurer prepares reports; the treasurer takes over when no senior is assigned.", 403);
}

/**
 * Check access to one record. `manage` requires the society's treasurer. Otherwise the record
 * must be visible to the actor: officers only reach their own cards, purchases and flags, and
 * events their card is on. Records they can't see look like they don't exist (404).
 */
export function assertResource(actor: Actor | null, table: "card" | "event" | "authorization" | "flag", id: string, manage = false) {
  const sql =
    table === "flag"
      ? `SELECT a.society_id, a.member_id FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.id=?`
      : table === "event"
        ? `SELECT society_id, NULL member_id FROM event WHERE id=?`
        : `SELECT society_id, member_id FROM ${table} WHERE id=?`;
  const row = getDb().prepare(sql).get(id) as { society_id: string; member_id: string | null } | undefined;
  if (!row) throw new UserError("not_found", "Record not found", 404);
  if (manage) return assertTreasurer(actor, row.society_id);
  assertSociety(actor, row.society_id);
  const visible = table === "event" ? canSeeEvent(actor, id) : canSeeOwned(actor, { society_id: row.society_id, member_id: row.member_id! });
  if (!visible) throw new UserError("not_found", "Record not found", 404);
}
