import { NextResponse } from "next/server";
import { createPlanCheckout } from "@/lib/payments";
import { apiError, handleError } from "@/lib/api";
import { getActor } from "@/lib/session";

/** POST /api/billing/checkout — Society Plan subscription (Checkout mode=subscription). */
export async function POST() {
  const actor = await getActor();
  if (actor?.kind !== "member" || actor.role !== "treasurer") return apiError(403, "forbidden", "Only the treasurer can subscribe.");
  try {
    return NextResponse.json(await createPlanCheckout(actor.societyId));
  } catch (e) {
    return handleError(e);
  }
}
