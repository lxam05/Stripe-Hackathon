import { NextResponse } from "next/server";
import { listFlags } from "@/lib/queries";
import { apiError } from "@/lib/api";
import { getActor } from "@/lib/session";

/** GET /api/flags?status=open|resolved|all — review queue. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  const status = (new URL(req.url).searchParams.get("status") ?? "open") as "open" | "resolved" | "all";
  const rows = listFlags({ societyId: actor.kind === "member" ? actor.societyId : undefined, status });
  return NextResponse.json({
    flags: rows.map((r) => ({
      id: r.f_id,
      severity: r.f_severity,
      status: r.f_status,
      authorization_id: r.id,
      amount_cents: r.amount_cents,
      merchant: r.merchant_name,
      mcc: r.mcc,
      event: r.event_name,
      summary: r.ra_summary,
      created_at: r.f_created_at,
    })),
  });
}
