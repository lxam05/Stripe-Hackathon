import { getActor } from "@/lib/session";
import { apiError, handleError, readJson } from "@/lib/api";
import { addMember, changeLeadership, createSociety, draftReport, reviewPayment, revokeMandate, updateReport } from "@/lib/workflows";

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const actor=await getActor();
  if (!actor) return apiError(401,"unauthenticated","Choose a demo user first.");
  try {
    const { resource }=await params;
    const b=await readJson<Record<string,unknown>>(req); const id=String(b.id ?? "");
    if (resource === "societies") return Response.json({ id:createSociety(actor,{ name:b.name,slug:b.slug,treasurer:{ name:b.treasurerName,email:b.treasurerEmail },...(b.seniorName || b.seniorEmail ? { senior:{ name:b.seniorName,email:b.seniorEmail } } : {}) }) });
    if (resource === "leadership") changeLeadership(actor,id,{ treasurerId:b.treasurerId,seniorId:b.seniorId || null });
    else if (resource === "members") {
      if (actor.kind !== "member") return apiError(403,"forbidden","Only the society treasurer can add members.");
      return Response.json({ id:addMember(actor,actor.societyId,b) });
    } else if (resource === "reviews") reviewPayment(actor,id,{ status:b.action,note:b.note ?? "",...(b.recurring ? { mandate:{ minCents:Math.round(Number(b.min)*100),maxCents:Math.round(Number(b.max)*100),cadence:b.cadence,endsAt:`${b.endsOn}T23:59:59.000Z` } } : {}) });
    else if (resource === "mandates") revokeMandate(actor,id);
    else if (resource === "report-draft") {
      if (actor.kind !== "member") return apiError(403,"forbidden","Only the reporting owner can draft a report.");
      return Response.json({ id:await draftReport(actor,actor.societyId,Number(b.year)) });
    } else if (resource === "reports") updateReport(actor,id,{ action:b.action,narrative:b.narrative,estimateCents:b.estimate === undefined ? undefined : Math.round(Number(b.estimate)*100),notes:b.notes,approvedCents:b.approved === undefined ? undefined : Math.round(Number(b.approved)*100) });
    else return apiError(404,"not_found","Unknown workflow.");
    return Response.json({ ok:true });
  } catch(e) { return handleError(e); }
}
