import { NextResponse } from "next/server";
import { seed } from "@/lib/seed";
import { apiError, handleError } from "@/lib/api";
import { getActor } from "@/lib/session";

/** POST — regenerate the synthetic dataset (demo reset). */
export async function POST() {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  if (actor.kind !== "admin") return apiError(403, "forbidden", "Only the Societies Office can reset the demo.");
  try {
    const summary = await seed();
    const res = NextResponse.json({ ok: true, summary });
    return res;
  } catch (e) {
    return handleError(e);
  }
}
