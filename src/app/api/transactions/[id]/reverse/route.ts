import { NextResponse } from "next/server";
import { releaseAuthorization } from "@/lib/authorize";
import { apiError,handleError } from "@/lib/api";
import { assertResource } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getActor } from "@/lib/session";

/** POST — simulate a merchant reversal: the hold is released back to the society. */
export async function POST(_req: Request, ctx: RouteContext<"/api/transactions/[id]/reverse">) {
  const actor=await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const { id } = await ctx.params;
  try {assertResource(actor,"authorization",id);const a=getDb().prepare(`SELECT stripe_auth_id FROM authorization WHERE id=?`).get(id) as {stripe_auth_id:string|null};if(a.stripe_auth_id && !a.stripe_auth_id.startsWith("mock_"))return apiError(400,"network_owned","Use Stripe test helpers for a network payment; wait for its webhook.");}catch(e){return handleError(e);}
  return releaseAuthorization(id) ? NextResponse.json({ ok: true }) : apiError(409, "not_held", "Only held (pending) purchases can be reversed.");
}
