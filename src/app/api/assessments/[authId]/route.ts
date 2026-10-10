import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { assertResource } from "@/lib/access";
import { handleError } from "@/lib/api";
import { latestAssessment } from "@/lib/queries";
import { getDb } from "@/lib/db";

/** GET — latest risk assessment for an authorisation (used to poll while JEV runs). */
export async function GET(_req: Request, ctx: RouteContext<"/api/assessments/[authId]">) {
  const { authId } = await ctx.params;
  try {assertResource(await getActor(),"authorization",authId);} catch(e){return handleError(e);}
  const a = latestAssessment(authId);
  const state = getDb().prepare(
    `SELECT pr.status review_status, f.status flag_status
     FROM authorization x LEFT JOIN payment_review pr ON pr.authorization_id=x.id
     LEFT JOIN flag f ON f.authorization_id=x.id WHERE x.id=?`,
  ).get(authId) as { review_status: string | null; flag_status: string | null } | undefined;
  if (!a) return NextResponse.json({ status: "queued", review_status: state?.review_status ?? null, flag_status: state?.flag_status ?? null });
  return NextResponse.json({ status: a.status, source: a.source, risk_level: a.risk_level, summary: a.summary, review_status: state?.review_status ?? null, flag_status: state?.flag_status ?? null });
}
export const dynamic = "force-dynamic";
