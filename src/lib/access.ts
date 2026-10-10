import type { Actor } from "./session";
import { getDb } from "./db";
import { UserError } from "./errors";

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

export function assertResource(actor:Actor|null,table:"card"|"event"|"authorization"|"flag",id:string,manage=false) {
  const sql=table === "flag" ? `SELECT a.society_id FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.id=?` : `SELECT society_id FROM ${table} WHERE id=?`;
  const row=getDb().prepare(sql).get(id) as {society_id:string}|undefined;
  if(!row)throw new UserError("not_found","Record not found",404);
  if(manage)assertTreasurer(actor,row.society_id);else assertSociety(actor,row.society_id);
}
