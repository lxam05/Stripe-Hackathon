import { NextResponse } from "next/server";
import { releaseAuthorization } from "@/lib/authorize";
import { apiError } from "@/lib/api";
import { getActor } from "@/lib/session";

/** POST — simulate a merchant reversal: the hold is released back to the society. */
export async function POST(_req: Request, ctx: RouteContext<"/api/transactions/[id]/reverse">) {
  if (!(await getActor())) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const { id } = await ctx.params;
  return releaseAuthorization(id) ? NextResponse.json({ ok: true }) : apiError(409, "not_held", "Only held (pending) purchases can be reversed.");
}
