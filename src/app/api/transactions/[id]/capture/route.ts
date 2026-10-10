import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/authorize";
import { apiError, readJson } from "@/lib/api";
import { getActor } from "@/lib/session";
import { parseEuroToCents } from "@/lib/money";

/** POST — simulate the merchant capturing a held authorisation (optionally a different amount, e.g. a tip). */
export async function POST(req: Request, ctx: RouteContext<"/api/transactions/[id]/capture">) {
  if (!(await getActor())) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const { id } = await ctx.params;
  const b = await readJson<{ amount?: string }>(req).catch(() => ({}) as { amount?: string });
  const cents = b.amount ? parseEuroToCents(b.amount) : undefined;
  if (b.amount && cents == null) return apiError(400, "invalid_amount", "Enter a capture amount like 12.50");
  const ok = captureAuthorization(id, cents ?? undefined);
  return ok ? NextResponse.json({ ok: true }) : apiError(409, "not_held", "Only held (pending) purchases can be captured.");
}
