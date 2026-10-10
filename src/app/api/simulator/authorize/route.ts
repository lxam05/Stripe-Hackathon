import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { simulatePurchase } from "@/lib/simulator";
import { apiError, handleError, readJson } from "@/lib/api";
import { getActor } from "@/lib/session";
import { dublinToIso } from "@/lib/money";

/** POST /api/simulator/authorize — demo-only: fire a sandbox authorisation. */
export async function POST(req: Request) {
  const actor=await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  try {
    const b = await readJson<{
      card_id: string;
      amount_cents: number;
      mcc: string;
      merchant_name: string;
      country: string;
      city?: string;
      local_time?: string;
      auto_capture?: boolean;
    }>(req);
    const card=getDb().prepare(`SELECT society_id,member_id FROM card WHERE id=?`).get(b.card_id) as {society_id:string;member_id:string}|undefined;
    if(!card || (actor.kind === "member" && (actor.societyId !== card.society_id || (actor.role !== "treasurer" && actor.id !== card.member_id)))) return apiError(403,"forbidden","Use your own card, or manage cards as this society’s treasurer.");
    let at: string | undefined;
    if (b.local_time) {
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(b.local_time);
      if (!m) return apiError(400, "invalid_time", "Time override must look like 2026-10-10T02:14.");
      at = dublinToIso(m[1], m[2]);
    }
    const d = await simulatePurchase({
      cardId: String(b.card_id ?? ""),
      amountCents: Number(b.amount_cents),
      mcc: String(b.mcc ?? ""),
      merchantName: String(b.merchant_name ?? ""),
      country: String(b.country ?? "IE"),
      city: b.city,
      at,
      autoCapture: Boolean(b.auto_capture),
    });
    return NextResponse.json({
      authorization_id: d.authorizationId,
      approved: d.approved,
      decline_code: d.declineCode,
      decline_reason: d.declineReason,
      rules_score: d.score,
      signals: d.signals,
      decision_ms: Number(d.decisionMs.toFixed(2)),
      mode: d.mode,
      captured: d.captured,
    });
  } catch (e) {
    return handleError(e);
  }
}
