import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { societyBalances } from "@/lib/ledger";
import { apiError } from "@/lib/api";
import { getActor } from "@/lib/session";
import { canManageSociety } from "@/lib/access";

/** GET /api/societies/:id/ledger — balances + the 100 most recent ledger entries. */
export async function GET(_req: Request, ctx: RouteContext<"/api/societies/[id]/ledger">) {
  const actor = await getActor();
  const { id } = await ctx.params;
  if (!canManageSociety(actor, id)) return apiError(403, "forbidden", "Only your society's treasurer or the Societies Office can view the ledger.");
  const entries = getDb().prepare(`SELECT * FROM ledger_entry WHERE society_id=? ORDER BY id DESC LIMIT 100`).all(id);
  return NextResponse.json({ balances: societyBalances(id), entries });
}
