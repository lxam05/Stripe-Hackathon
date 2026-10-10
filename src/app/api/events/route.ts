import { NextResponse } from "next/server";
import { createEventWithCard, budgetWarning } from "@/lib/events";
import { apiError, handleError, readJson } from "@/lib/api";
import { getActor, actorLabel } from "@/lib/session";
import type { EventType } from "@/lib/mcc";

interface Body {
  name: string;
  type: EventType;
  start_date: string;
  end_date: string;
  expected_attendees: number;
  budget_cents: number;
  per_auth_cap_cents: number;
  cardholder_id: string;
  notes?: string;
}

/** POST /api/events — create an event and issue its virtual card (PRD M4). */
export async function POST(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "member" || actor.role !== "treasurer") return apiError(403, "forbidden", "Only the treasurer can create events.");
  try {
    const b = await readJson<Body>(req);
    const res = await createEventWithCard(
      {
        societyId: actor.societyId,
        name: String(b.name ?? ""),
        type: b.type,
        startDate: String(b.start_date ?? ""),
        endDate: String(b.end_date ?? ""),
        expectedAttendees: Number(b.expected_attendees ?? 0),
        budgetCents: Number(b.budget_cents),
        perAuthCapCents: Number(b.per_auth_cap_cents),
        cardholderId: String(b.cardholder_id ?? ""),
        notes: b.notes,
      },
      actorLabel(actor),
    );
    return NextResponse.json(
      { event_id: res.eventId, card_id: res.cardId, card_issued: res.issued.ok, card_error: res.issued.ok ? null : res.issued.error },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}

/** GET /api/events?budget_cents= — live over-budget warning for the form. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "member") return apiError(403, "forbidden", "Sign in as a society member.");
  const cents = Number(new URL(req.url).searchParams.get("budget_cents") ?? 0);
  return NextResponse.json({ warning: budgetWarning(actor.societyId, cents) });
}
