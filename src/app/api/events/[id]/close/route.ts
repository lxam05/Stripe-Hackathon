import { assertResource } from "@/lib/access";
import { NextResponse } from "next/server";
import { closeEvent } from "@/lib/events";
import { handleError } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";

export async function POST(_req: Request, ctx: RouteContext<"/api/events/[id]/close">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    assertResource(actor,"event",id,true);
    await closeEvent(id, actorLabel(actor!));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
