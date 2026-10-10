import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ACTOR_COOKIE, getActor } from "@/lib/session";
import { apiError } from "@/lib/api";

/** GET /api/session: who this browser is signed in as (lets other tabs notice a user switch). */
export async function GET() {
  const actor = await getActor();
  return NextResponse.json({ actor: actor?.id ?? null });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { actor?: string };
  const actor = String(body.actor ?? "");
  if (actor !== "admin" && !getDb().prepare(`SELECT id FROM member WHERE id=?`).get(actor)) {
    return apiError(400, "unknown_user", "Pick one of the demo users.");
  }
  const res = NextResponse.json({ ok: true, redirect: actor === "admin" ? "/admin" : "/dashboard" });
  res.cookies.set(ACTOR_COOKIE, actor, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACTOR_COOKIE);
  return res;
}
