import { NextResponse } from "next/server";
import { confirmCheckoutSession } from "@/lib/payments";
import { apiError, handleError } from "@/lib/api";

/** GET /api/topups/status?session_id= — success-page polling until the payment is confirmed. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("session_id");
  if (!id) return apiError(400, "missing_session", "session_id is required");
  try {
    return NextResponse.json(await confirmCheckoutSession(id));
  } catch (e) {
    return handleError(e);
  }
}
