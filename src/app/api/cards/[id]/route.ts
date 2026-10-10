import { NextResponse } from "next/server";
import { assignCard, issueCard, setCardStatus, updateCardLimits } from "@/lib/cards";
import { apiError, handleError, readJson } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";
import { canManageSociety, cardOwner } from "@/lib/access";
import type { CardRestrictionProfile } from "@/lib/card-restrictions";

interface Body {
  action: string;
  reason?: string;
  event_id?: string | null;
  per_auth_cap_cents?: number;
  monthly_limit_cents?: number;
  restriction_profile?: CardRestrictionProfile;
}

/**
 * PATCH /api/cards/:id
 *   { action: freeze | unfreeze | cancel | retry, reason? }
 *   { action: assign, event_id: string | null }          point the card at an open event, or general spending
 *   { action: limits, per_auth_cap_cents, monthly_limit_cents }
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/cards/[id]">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    const owner = cardOwner(id);
    if (!owner) return apiError(404, "not_found", "Card not found");
    if (!canManageSociety(actor, owner.society_id)) return apiError(403, "forbidden", "Only the treasurer can change cards.");
    const b = await readJson<Body>(req);
    const who = actorLabel(actor!);
    if (b.action === "freeze") await setCardStatus(id, "inactive", b.reason || "Frozen by treasurer", who);
    else if (b.action === "unfreeze") await setCardStatus(id, "active", b.reason || "Unfrozen by treasurer", who);
    else if (b.action === "cancel") await setCardStatus(id, "canceled", b.reason || "Cancelled by treasurer", who);
    else if (b.action === "assign") assignCard(id, b.event_id || null, who);
    else if (b.action === "limits") {
      await updateCardLimits(id, Number(b.per_auth_cap_cents), Number(b.monthly_limit_cents), who, b.restriction_profile);
    }
    else if (b.action === "retry") {
      const r = await issueCard(id, who);
      if (!r.ok) return apiError(502, "card_issue_failed", `Card still pending: ${r.error}`);
    } else return apiError(400, "invalid_action", "Action must be freeze, unfreeze, cancel, retry, assign or limits.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
