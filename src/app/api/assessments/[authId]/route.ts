import { NextResponse } from "next/server";
import { latestAssessment } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { authorizationOwner, canSeeOwned } from "@/lib/access";
import { getActor } from "@/lib/session";

/** GET — latest risk assessment for an authorisation (used to poll while JEV runs). */
export async function GET(_req: Request, ctx: RouteContext<"/api/assessments/[authId]">) {
  const { authId } = await ctx.params;
  if (!canSeeOwned(await getActor(), authorizationOwner(authId))) return apiError(404, "not_found", "Purchase not found");
  const a = latestAssessment(authId);
  if (!a) return NextResponse.json({ status: "queued" });
  return NextResponse.json({ status: a.status, source: a.source, risk_level: a.risk_level, summary: a.summary });
}
export const dynamic = "force-dynamic";
