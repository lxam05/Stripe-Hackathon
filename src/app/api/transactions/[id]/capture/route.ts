import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/authorize";
import { apiError, readJson,handleError } from "@/lib/api";
import { assertResource } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getActor } from "@/lib/session";
import { parseEuroToCents } from "@/lib/money";

/** POST — simulate the merchant capturing a held authorisation (optionally a different amount, e.g. a tip). */
export async function POST(req: Request, ctx: RouteContext<"/api/transactions/[id]/capture">) {
  const actor=await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const { id } = await ctx.params;
  try {assertResource(actor,"authorization",id);const a=getDb().prepare(`SELECT stripe_auth_id FROM authorization WHERE id=?`).get(id) as {stripe_auth_id:string|null};if(a.stripe_auth_id && !a.stripe_auth_id.startsWith("mock_"))return apiError(400,"network_owned","Use Stripe test helpers for a network payment; wait for its webhook.");}catch(e){return handleError(e);}
  const b = await readJson<{ amount?: string }>(req).catch(() => ({}) as { amount?: string });
  const cents = b.amount ? parseEuroToCents(b.amount) : undefined;
  if (b.amount && cents == null) return apiError(400, "invalid_amount", "Enter a capture amount like 12.50");
  if(cents !== undefined && cents !== null && cents<=0)return apiError(400,"invalid_amount","Capture must be positive.");
  const ok = captureAuthorization(id, cents ?? undefined);
  return ok ? NextResponse.json({ ok: true }) : apiError(409, "not_held", "Only held (pending) purchases can be captured.");
}
