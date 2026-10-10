import type Stripe from "stripe";
import { stripeEnabled } from "./env";
import { UserError } from "./errors";
import { mccInfo } from "./mcc";
import { getStripe } from "./stripe";

// Two fictional outside web shops, deliberately not part of Balance. The officer types their
// Balance card's number, expiry and CVC into the shop's own payment form. The shop then acts
// as the merchant + card network: it charges that Stripe Issuing card with its own merchant
// name and category, Stripe asks Balance's webhook to approve or decline in real time
// (issuing_authorization.request), and an approved payment is captured so it settles.
//
// Stripe Checkout can't be used here: in a sandbox it only accepts Stripe's test card numbers
// and declines Issuing card numbers (incorrect_number) before Issuing sees them. The shop
// therefore uses Stripe's Issuing test helpers for the network leg; everything from the
// authorisation onwards is the real Stripe flow.

export const SHOPS = {
  pizza: {
    name: "Slice Republic",
    merchant: "SLICE REPUBLIC RATHMINES",
    mcc: "5814",
    items: [
      { id: "deal", name: "Rehearsal deal", blurb: "2 large pizzas, any toppings", cents: 1840 },
      { id: "margherita", name: "Margherita", blurb: "Large, wood-fired", cents: 950 },
    ],
  },
  games: {
    name: "Pixel Vault",
    merchant: "PIXEL VAULT GAMES",
    mcc: "5732",
    items: [
      { id: "portal", name: "PlayStation Portal", blurb: "Sony remote player for PS5", cents: 21999 },
      { id: "ps5pro", name: "PlayStation 5 Pro", blurb: "2 TB console + DualSense controller", cents: 79999 },
    ],
  },
} as const;

export type ShopId = keyof typeof SHOPS;
export const isShopId = (v: unknown): v is ShopId => typeof v === "string" && v in SHOPS;

export function shopItem(shopId: string, itemId: string) {
  if (!isShopId(shopId)) return null;
  const item = SHOPS[shopId].items.find((i) => i.id === itemId);
  return item ? { shop: SHOPS[shopId], item } : null;
}

export interface CardEntry {
  number: string;
  exp: string; // MM/YY
  cvc: string;
}

/** The site-issued, active Stripe card with exactly these details, or null (a real merchant would see "declined"). */
async function findIssuedCard(entry: CardEntry): Promise<Stripe.Issuing.Card | null> {
  const number = entry.number.replace(/\D/g, "");
  const [mm, yy] = entry.exp.split("/").map((p) => Number(p.trim()));
  if (number.length < 12 || !mm || !yy) return null;
  const s = getStripe();
  for await (const c of s.issuing.cards.list({ status: "active", limit: 100 })) {
    if (c.metadata?.balance_origin !== "balance_site" || c.last4 !== number.slice(-4)) continue;
    if (c.exp_month !== mm || c.exp_year % 100 !== yy % 100) continue;
    const full = await s.issuing.cards.retrieve(c.id, { expand: ["number", "cvc"] });
    if (full.number === number && full.cvc === entry.cvc.trim()) return full;
  }
  return null;
}

export type ShopPayment = { approved: true; last4: string } | { approved: false; reason: string };

/**
 * Charge the officer's card for one item. `orderKey` makes a double-submitted form charge once.
 * The shop only learns approved/declined, like a real merchant; the reasons live in Balance.
 */
export async function payAtShop(shopId: string, itemId: string, entry: CardEntry, orderKey: string): Promise<ShopPayment> {
  const found = shopItem(shopId, itemId);
  if (!found) throw new UserError("validation", "That item isn't on sale.");
  if (!stripeEnabled()) throw new UserError("stripe_required", "Card payments are unavailable: set STRIPE_SECRET_KEY.", 503);
  const card = await findIssuedCard(entry);
  if (!card) return { approved: false, reason: "Card declined. Check the card number, expiry date and CVC." };

  const s = getStripe();
  const auth = await s.testHelpers.issuing.authorizations.create(
    {
      card: card.id,
      amount: found.item.cents,
      currency: "eur",
      merchant_data: {
        name: found.shop.merchant,
        category: mccInfo(found.shop.mcc).stripe as never,
        city: "Dublin",
        country: "IE",
      },
    },
    { idempotencyKey: `shop-auth-${orderKey}` },
  );
  if (!auth.approved) return { approved: false, reason: "Card declined by your card issuer." };
  // Settle straight away, as an online shop does when it ships; Balance records the capture.
  if (auth.status === "pending") await s.testHelpers.issuing.authorizations.capture(auth.id, {}, { idempotencyKey: `shop-capture-${orderKey}` });
  return { approved: true, last4: card.last4 };
}
