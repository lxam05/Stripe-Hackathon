import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { assertResource } from "@/lib/access";
import { handleError } from "@/lib/api";
import { latestAssessment } from "@/lib/queries";

/** GET — latest risk assessment for an authorisation (used to poll while JEV runs). */
export async function GET(_req: Request, ctx: RouteContext<"/api/assessments/[authId]">) {
  const { authId } = await ctx.params;
  try {assertResource(await getActor(),"authorization",authId);} catch(e){return handleError(e);}
  const a = latestAssessment(authId);
  if (!a) return NextResponse.json({ status: "queued" });
  return NextResponse.json({ status: a.status, source: a.source, risk_level: a.risk_level, summary: a.summary });
}
export const dynamic = "force-dynamic";
