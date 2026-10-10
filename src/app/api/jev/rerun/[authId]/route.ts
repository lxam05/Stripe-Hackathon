import { NextResponse } from "next/server";
import { rerunAssessment } from "@/lib/assess";
import { apiError, handleError } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";
import { authorizationOwner, canManageSociety } from "@/lib/access";

/** POST — run JEV (again) on one purchase, e.g. seeded history or after a model change. */
export async function POST(_req: Request, ctx: RouteContext<"/api/jev/rerun/[authId]">) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  try {
    const { authId } = await ctx.params;
    const owner = authorizationOwner(authId);
    if (!owner) return apiError(404, "not_found", "Purchase not found");
    if (!canManageSociety(actor, owner.society_id)) return apiError(403, "forbidden", "Only the treasurer or Societies Office can run JEV.");
    await rerunAssessment(authId, actorLabel(actor));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
