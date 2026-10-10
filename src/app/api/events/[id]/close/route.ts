import { NextResponse } from "next/server";
import { closeEvent } from "@/lib/events";
import { apiError, handleError } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";
import { canManageSociety, eventSociety } from "@/lib/access";

export async function POST(_req: Request, ctx: RouteContext<"/api/events/[id]/close">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    const societyId = eventSociety(id);
    if (!societyId) return apiError(404, "not_found", "Event not found");
    if (!canManageSociety(actor, societyId)) return apiError(403, "forbidden", "Only the treasurer can close events.");
    await closeEvent(id, actorLabel(actor!));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
