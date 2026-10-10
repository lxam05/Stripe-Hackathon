import { NextResponse } from "next/server";
import { UserError } from "./errors";

/** Consistent error envelope (PRD §13.4): { error: { code, message, details? } } */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof UserError) return apiError(err.status, err.code, err.message);
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[api]", err);
  // Stripe errors carry a useful message; never leak a stack trace to the UI.
  if (err && typeof err === "object" && "type" in err && String((err as { type: string }).type).startsWith("Stripe")) {
    return apiError(502, "stripe_error", `Stripe said: ${msg}`);
  }
  return apiError(500, "internal", "Something went wrong on our side. Nothing was charged; please try again.");
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new UserError("bad_json", "Request body must be JSON.");
  }
}
