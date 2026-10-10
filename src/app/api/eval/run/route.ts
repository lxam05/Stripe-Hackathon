import { NextResponse } from "next/server";
import { evalProgress, runEval } from "@/lib/evaluation";
import { apiError } from "@/lib/api";
import { jevEnabled } from "@/lib/env";
import { getActor } from "@/lib/session";

/** POST — start a background JEV evaluation run (S6). Poll the Evaluation page for progress. */
export async function POST() {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Pick a demo user first.");
  if (actor.kind === "member" && actor.role !== "treasurer") return apiError(403, "forbidden", "Only treasurers and the Societies Office can run the evaluation.");
  if (!jevEnabled()) return apiError(400, "jev_not_configured", "Add OPENROUTER_API_KEY to run the evaluation.");
  if (evalProgress().running) return apiError(409, "already_running", "An evaluation is already running.");
  runEval().catch((e) => console.error("[eval]", e));
  return NextResponse.json({ started: true }, { status: 202 });
}
