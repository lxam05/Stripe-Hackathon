import { NextResponse } from "next/server";
import { apiError, handleError } from "@/lib/api";
import { cardOwner } from "@/lib/access";
import { stripeCardDetails } from "@/lib/cards";
import { getActor } from "@/lib/session";

/** GET /api/cards/:id/details — full number, expiry and CVC of a real sandbox card, for its cardholder only. */
export async function GET(_req: Request, ctx: RouteContext<"/api/cards/[id]/details">) {
  const actor = await getActor();
  try {
    const { id } = await ctx.params;
    const owner = cardOwner(id);
    if (!owner || actor?.kind !== "member" || actor.id !== owner.member_id) return apiError(404, "not_found", "Card not found");
    const details = await stripeCardDetails(id);
    if (!details) return apiError(409, "not_a_stripe_card", "This card is simulated, so it has no card number to pay with online.");
    return NextResponse.json(details, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
