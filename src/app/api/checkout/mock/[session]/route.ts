import { NextResponse } from "next/server";
import { completeMockCheckout } from "@/lib/payments";
import { apiError, handleError } from "@/lib/api";
import { stripeEnabled } from "@/lib/env";
import { canManageSociety } from "@/lib/access";
import { getActor } from "@/lib/session";

/** POST — complete a simulated checkout. Only available when Stripe keys aren't configured. */
export async function POST(_req: Request, ctx: RouteContext<"/api/checkout/mock/[session]">) {
  if (stripeEnabled()) return apiError(400, "stripe_configured", "Stripe is configured; use the real Checkout page.");
  try {
    const { session } = await ctx.params;
    // Sponsor top-ups are public; paying for the Society Plan is the treasurer's call.
    if (session.startsWith("mock_plan_") && !canManageSociety(await getActor(), session.slice("mock_plan_".length))) {
      return apiError(403, "forbidden", "Only the society's treasurer can subscribe.");
    }
    return NextResponse.json(await completeMockCheckout(session));
  } catch (e) {
    return handleError(e);
  }
}
