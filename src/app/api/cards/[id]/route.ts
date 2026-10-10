import { NextResponse } from "next/server";
import { issueCard, setCardStatus } from "@/lib/cards";
import { apiError, handleError, readJson } from "@/lib/api";
import { actorLabel, canManage, getActor } from "@/lib/session";

/** PATCH /api/cards/:id  { action: freeze | unfreeze | cancel | retry, reason? } */
export async function PATCH(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await getActor();
  if (!canManage(actor)) return apiError(403, "forbidden", "Only the treasurer can change cards.");
  try {
    const { id } = await ctx.params;
    const { action, reason } = await readJson<{ action: string; reason?: string }>(req);
    const who = actorLabel(actor!);
    if (action === "freeze") await setCardStatus(id, "inactive", reason || "Frozen by treasurer", who);
    else if (action === "unfreeze") await setCardStatus(id, "active", reason || "Unfrozen by treasurer", who);
    else if (action === "cancel") await setCardStatus(id, "canceled", reason || "Cancelled by treasurer", who);
    else if (action === "retry") {
      const r = await issueCard(id, who);
      if (!r.ok) return apiError(502, "card_issue_failed", `Card still pending: ${r.error}`);
    } else return apiError(400, "invalid_action", "Action must be freeze, unfreeze, cancel or retry.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
