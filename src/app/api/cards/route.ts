import { NextResponse } from "next/server";
import { createOfficerCard } from "@/lib/cards";
import { apiError, handleError, readJson } from "@/lib/api";
import { actorLabel, getActor } from "@/lib/session";
import { isCardRestrictionProfile, type CardRestrictionProfile } from "@/lib/card-restrictions";

interface Body {
  member_id: string;
  per_auth_cap_cents: number;
  monthly_limit_cents: number;
  restriction_profile: CardRestrictionProfile;
  event_id?: string | null;
}

/** POST /api/cards — issue an officer card to a committee member (max 5 per society). */
export async function POST(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "member" || actor.role !== "treasurer") return apiError(403, "forbidden", "Only the treasurer can issue cards.");
  try {
    const b = await readJson<Body>(req);
    if (!isCardRestrictionProfile(b.restriction_profile)) return apiError(400, "validation", "Choose a valid card spending profile.");
    const res = await createOfficerCard(
      {
        societyId: actor.societyId,
        memberId: String(b.member_id ?? ""),
        perAuthCapCents: Number(b.per_auth_cap_cents),
        monthlyLimitCents: Number(b.monthly_limit_cents),
        restrictionProfile: b.restriction_profile,
        eventId: b.event_id || null,
      },
      actorLabel(actor),
    );
    return NextResponse.json(
      { card_id: res.cardId, card_issued: res.issued.ok, card_error: res.issued.ok ? null : res.issued.error },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}
