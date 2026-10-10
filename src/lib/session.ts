import { cookies } from "next/headers";
import { getDb } from "./db";
import type { Role } from "./roles";

// Demo "login": pick a seeded user (PRD §12 role switcher). No real auth — sandbox only.

export const ACTOR_COOKIE = "balance_actor";

export interface MemberActor {
  kind: "member";
  id: string;
  name: string;
  role: Role;
  societyId: string;
  societyName: string;
  societySlug: string;
  societyIcon: string;
}
export interface AdminActor {
  kind: "admin";
  id: "admin";
  name: string;
}
export type Actor = MemberActor | AdminActor;

export async function getActor(): Promise<Actor | null> {
  const jar = await cookies();
  const v = jar.get(ACTOR_COOKIE)?.value;
  if (!v) return null;
  if (v === "admin") return { kind: "admin", id: "admin", name: "Societies Office (demo)" };
  const row = getDb()
    .prepare(
      `SELECT m.id, m.name, m.role, s.id sid, s.name sname, s.slug, s.icon FROM member m JOIN society s ON s.id=m.society_id WHERE m.id=?`,
    )
    .get(v) as
    | { id: string; name: string; role: MemberActor["role"]; sid: string; sname: string; slug: string; icon: string }
    | undefined;
  if (!row) return null;
  return {
    kind: "member",
    id: row.id,
    name: row.name,
    role: row.role,
    societyId: row.sid,
    societyName: row.sname,
    societySlug: row.slug,
    societyIcon: row.icon,
  };
}


export const actorLabel = (a: Actor) => (a.kind === "admin" ? "admin" : a.id);
