import { NextResponse } from "next/server";
import { releaseAuthorization } from "@/lib/authorize";
import { apiError } from "@/lib/api";
import { getActor } from "@/lib/session";
import { authorizationOwner, canSeeOwned } from "@/lib/access";

/** POST — simulate a merchant reversal: the hold is released back to the society. */
export async function POST(_req: Request, ctx: RouteContext<"/api/transactions/[id]/reverse">) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const { id } = await ctx.params;
  if (!canSeeOwned(actor, authorizationOwner(id))) return apiError(404, "not_found", "Purchase not found");
  return releaseAuthorization(id) ? NextResponse.json({ ok: true }) : apiError(409, "not_held", "Only held (pending) purchases can be reversed.");
}
