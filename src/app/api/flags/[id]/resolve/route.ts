import { NextResponse } from "next/server";
import { resolveFlag, type Resolution } from "@/lib/events";
import { apiError, handleError, readJson } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";
import { canManageSociety, flagOwner } from "@/lib/access";

/** POST /api/flags/:id/resolve  { resolution: legit | receipt_requested | fraud, note, unfreeze?, reverse? } */
export async function POST(req: Request, ctx: RouteContext<"/api/flags/[id]/resolve">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    const owner = flagOwner(id);
    if (!owner) return apiError(404, "not_found", "Flag not found");
    if (!canManageSociety(actor, owner.society_id)) return apiError(403, "forbidden", "Only the treasurer or Societies Office can resolve flags.");
    const b = await readJson<{ resolution: Resolution; note?: string; unfreeze?: boolean; reverse?: boolean }>(req);
    await resolveFlag(id, b.resolution, b.note ?? "", actorLabel(actor!), { unfreeze: b.unfreeze, reverse: b.reverse });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
