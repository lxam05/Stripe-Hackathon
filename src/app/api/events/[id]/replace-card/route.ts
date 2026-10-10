import { NextResponse } from "next/server";
import { replaceCard } from "@/lib/events";
import { apiError, handleError } from "@/lib/api";
import { actorLabel, canManage, getActor } from "@/lib/session";

export async function POST(_req: Request, ctx: RouteContext<"/api/events/[id]/replace-card">) {
  const actor = await getActor();
  if (!canManage(actor)) return apiError(403, "forbidden", "Only the treasurer can issue cards.");
  try {
    const { id } = await ctx.params;
    const r = await replaceCard(id, actorLabel(actor!));
    return r.ok ? NextResponse.json({ ok: true }) : apiError(502, "card_issue_failed", r.error);
  } catch (e) {
    return handleError(e);
  }
}
