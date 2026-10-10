import { NextResponse } from "next/server";
import { closeEvent } from "@/lib/events";
import { apiError, handleError } from "@/lib/api";
import { actorLabel, canManage, getActor } from "@/lib/session";

export async function POST(_req: Request, ctx: RouteContext<"/api/events/[id]/close">) {
  const actor = await getActor();
  if (!canManage(actor)) return apiError(403, "forbidden", "Only the treasurer can close events.");
  try {
    const { id } = await ctx.params;
    await closeEvent(id, actorLabel(actor!));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
