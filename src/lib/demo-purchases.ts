import { getDb, nowIso } from "./db";
import { DEMO_PRODUCTS, type DemoProductId } from "./demo-shop";
import { UserError } from "./errors";
import { societyBalances } from "./ledger";
import { simulatePurchase } from "./simulator";

export async function performDemoPurchase(cardId: string, productId: DemoProductId, requestKey?: string) {
  const db = getDb();
  const card = db.prepare(
    `SELECT c.id, c.society_id, c.member_id, c.last4, c.status, m.name cardholder
     FROM card c JOIN member m ON m.id=c.member_id WHERE c.id=?`,
  ).get(cardId) as { id: string; society_id: string; member_id: string; last4: string; status: string; cardholder: string } | undefined;
  if (!card) throw new UserError("not_found", "Card not found.", 404);

  if (requestKey) {
    const prior = db.prepare(`SELECT card_id,product_id,response_json FROM demo_purchase_request WHERE request_key=?`).get(requestKey) as
      | { card_id: string; product_id: string; response_json: string }
      | undefined;
    if (prior && (prior.card_id !== card.id || prior.product_id !== productId)) {
      throw new UserError("idempotency_conflict", "That purchase key was already used for a different request.", 409);
    }
    if (prior) return JSON.parse(prior.response_json) as DemoPurchaseResponse;
  }

  const product = DEMO_PRODUCTS[productId];
  const balanceBefore = societyBalances(card.society_id).available;
  const decision = await simulatePurchase({
    cardId: card.id,
    amountCents: product.amountCents,
    merchantName: product.merchant,
    mcc: product.mcc,
    country: product.country,
    city: product.city,
    autoCapture: true,
  });
  const response: DemoPurchaseResponse = {
    authorization_id: decision.authorizationId,
    approved: decision.approved,
    captured: decision.captured,
    cardholder: card.cardholder,
    card_last4: card.last4,
    balance_before: balanceBefore,
    balance_after: societyBalances(card.society_id).available,
    decline_reason: decision.declineReason,
  };
  if (requestKey) {
    db.prepare(`INSERT OR IGNORE INTO demo_purchase_request(request_key,card_id,product_id,response_json,created_at) VALUES(?,?,?,?,?)`).run(
      requestKey,
      card.id,
      product.id,
      JSON.stringify(response),
      nowIso(),
    );
  }
  return response;
}

export interface DemoPurchaseResponse {
  authorization_id: string | null;
  approved: boolean;
  captured: boolean;
  cardholder: string;
  card_last4: string;
  balance_before: number;
  balance_after: number;
  decline_reason: string | null;
}
