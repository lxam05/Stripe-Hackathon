import { NextResponse } from "next/server";
import { apiError, handleError, readJson } from "@/lib/api";
import { canSeeOwned } from "@/lib/access";
import { getDb } from "@/lib/db";
import { isDemoProductId } from "@/lib/demo-shop";
import { getActor } from "@/lib/session";
import { performDemoPurchase } from "@/lib/demo-purchases";

interface Body { card_id: string; product_id: string }

/** A deliberately tiny demo checkout: price and merchant data are always server-owned. */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthenticated", "Choose a demo user first.");
  try {
    const body = await readJson<Body>(req);
    if (!isDemoProductId(body.product_id)) return apiError(400, "invalid_product", "That product is not in the campus marketplace.");
    const db = getDb();
    const card = db.prepare(`SELECT id,society_id,member_id FROM card WHERE id=?`).get(String(body.card_id ?? "")) as
      | { id: string; society_id: string; member_id: string }
      | undefined;
    if (!card || !canSeeOwned(actor, card)) return apiError(404, "not_found", "Card not found.");

    const requestKey = req.headers.get("idempotency-key")?.trim().slice(0, 120);
    return NextResponse.json(await performDemoPurchase(card.id, body.product_id, requestKey));
  } catch (error) {
    return handleError(error);
  }
}
