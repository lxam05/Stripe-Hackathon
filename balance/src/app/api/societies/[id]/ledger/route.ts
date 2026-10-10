import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { societyBalances } from "@/lib/ledger";
import { apiError } from "@/lib/api";
import { getActor } from "@/lib/session";

/** GET /api/societies/:id/ledger — balances + the 100 most recent ledger entries. */
export async function GET(_req: Request, ctx: RouteContext<"/api/societies/[id]/ledger">) {
  const actor = await getActor();
  const { id } = await ctx.params;
  if (!actor || (actor.kind === "member" && actor.societyId !== id)) return apiError(403, "forbidden", "You can only view your own society's ledger.");
  const entries = getDb().prepare(`SELECT * FROM ledger_entry WHERE society_id=? ORDER BY id DESC LIMIT 100`).all(id);
  return NextResponse.json({ balances: societyBalances(id), entries });
}
