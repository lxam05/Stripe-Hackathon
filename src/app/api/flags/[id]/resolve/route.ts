import { assertResource } from "@/lib/access";
import { NextResponse } from "next/server";
import { resolveFlag, type Resolution } from "@/lib/events";
import { apiError, handleError, readJson } from "@/lib/api";
import { actorLabel, canManage, getActor } from "@/lib/session";

/** POST /api/flags/:id/resolve  { resolution: legit | receipt_requested | fraud, note, unfreeze?, reverse? } */
export async function POST(req: Request, ctx: RouteContext<"/api/flags/[id]/resolve">) {
  const actor = await getActor();
  if (!canManage(actor)) return apiError(403, "forbidden", "Only the treasurer or Societies Office can resolve flags.");
  try {
    const { id } = await ctx.params;
    assertResource(actor,"flag",id,true);
    const b = await readJson<{ resolution: Resolution; note?: string; unfreeze?: boolean; reverse?: boolean }>(req);
    await resolveFlag(id, b.resolution, b.note ?? "", actorLabel(actor!), { unfreeze: b.unfreeze, reverse: b.reverse });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
