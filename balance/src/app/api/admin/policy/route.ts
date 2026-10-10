import { NextResponse } from "next/server";
import { setPolicy } from "@/lib/policy";
import { apiError, handleError, readJson } from "@/lib/api";
import { audit } from "@/lib/db";
import { getActor } from "@/lib/session";
import { EVENT_TYPES, type EventType, type MccPolicyAction } from "@/lib/mcc";

/** POST — set the global (Societies Office) policy for one MCC (S5). */
export async function POST(req: Request) {
  const actor = await getActor();
  if (actor?.kind !== "admin") return apiError(403, "forbidden", "Only the Societies Office can change UCD-wide policy.");
  try {
    const b = await readJson<{ mcc: string; action: MccPolicyAction; preapproved?: EventType[] }>(req);
    if (!/^\d{4}$/.test(b.mcc ?? "")) return apiError(400, "invalid_mcc", "MCC must be four digits.");
    if (!["block", "review", "allow"].includes(b.action)) return apiError(400, "invalid_action", "Action must be block, review or allow.");
    const pre = (b.preapproved ?? []).filter((t) => EVENT_TYPES.some((e) => e.value === t));
    setPolicy("global", "", b.mcc, b.action, pre);
    audit("admin", "policy.set", b.mcc, { action: b.action, preapproved: pre });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
