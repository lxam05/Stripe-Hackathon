import { assertResource } from "@/lib/access";
import { NextResponse } from "next/server";
import { replaceCard } from "@/lib/cards";
import { apiError, handleError } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";

/** POST /api/cards/:id/replace — new card for the same officer after a cancellation. */
export async function POST(_req: Request, ctx: RouteContext<"/api/cards/[id]/replace">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    assertResource(actor,"card",id,true);
    const r = await replaceCard(id, actorLabel(actor!));
    return r.issued.ok ? NextResponse.json({ ok: true, card_id: r.cardId }) : apiError(502, "card_issue_failed", r.issued.error);
  } catch (e) {
    return handleError(e);
  }
}
