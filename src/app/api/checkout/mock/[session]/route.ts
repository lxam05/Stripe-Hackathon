import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { assertTreasurer } from "@/lib/access";
import { getDb } from "@/lib/db";
import { completeMockCheckout } from "@/lib/payments";
import { apiError, handleError } from "@/lib/api";
import { stripeEnabled } from "@/lib/env";

/** POST — complete a simulated checkout. Only available when Stripe keys aren't configured. */
export async function POST(_req: Request, ctx: RouteContext<"/api/checkout/mock/[session]">) {
  if (stripeEnabled()) return apiError(400, "stripe_configured", "Stripe is configured; use the real Checkout page.");
  try {
    const { session } = await ctx.params;
    if(session.startsWith("mock_plan_")) assertTreasurer(await getActor(),session.slice(10));
    if(session.startsWith("mock_slot_")) {const p=getDb().prepare(`SELECT society_id FROM card_slot_purchase WHERE checkout_session_id=?`).get(session) as {society_id:string}|undefined;if(!p)return apiError(404,"not_found","Checkout not found");assertTreasurer(await getActor(),p.society_id);}
    return NextResponse.json(await completeMockCheckout(session));
  } catch (e) {
    return handleError(e);
  }
}
