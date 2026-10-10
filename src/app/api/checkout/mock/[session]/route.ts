import { NextResponse } from "next/server";
import { completeMockCheckout } from "@/lib/payments";
import { apiError, handleError } from "@/lib/api";
import { stripeEnabled } from "@/lib/env";

/** POST — complete a simulated checkout. Only available when Stripe keys aren't configured. */
export async function POST(_req: Request, ctx: RouteContext<"/api/checkout/mock/[session]">) {
  if (stripeEnabled()) return apiError(400, "stripe_configured", "Stripe is configured; use the real Checkout page.");
  try {
    const { session } = await ctx.params;
    return NextResponse.json(await completeMockCheckout(session));
  } catch (e) {
    return handleError(e);
  }
}
