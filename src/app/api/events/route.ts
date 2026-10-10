import { NextResponse } from "next/server";
import { createEvent, budgetWarning } from "@/lib/events";
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
  card_ids?: string[];
  notes?: string;
}

/** POST /api/events — create an event budget and point officer cards at it. */
export async function POST(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "member" || actor.role !== "treasurer") return apiError(403, "forbidden", "Only the treasurer can create events.");
  try {
    const b = await readJson<Body>(req);
    const res = createEvent(
      {
        societyId: actor.societyId,
        name: String(b.name ?? ""),
        type: b.type,
        startDate: String(b.start_date ?? ""),
        endDate: String(b.end_date ?? ""),
        expectedAttendees: Number(b.expected_attendees ?? 0),
        budgetCents: Number(b.budget_cents),
        cardIds: Array.isArray(b.card_ids) ? b.card_ids.map(String) : [],
        notes: b.notes,
      },
      actorLabel(actor),
    );
    return NextResponse.json({ event_id: res.eventId }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

/** GET /api/events?budget_cents= — live over-budget warning for the form. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "member" || actor.role !== "treasurer") return apiError(403, "forbidden", "Only the treasurer can see the society's money.");
  const cents = Number(new URL(req.url).searchParams.get("budget_cents") ?? 0);
  return NextResponse.json({ warning: budgetWarning(actor.societyId, cents) });
}
