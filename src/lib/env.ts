// Central configuration. Every integration degrades gracefully:
//  - no STRIPE_SECRET_KEY  → simulated Checkout + MockAdapter card network
//  - no OPENROUTER_API_KEY → JEV unavailable, rules-only assessments ("AI unavailable")

const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || "";

if (stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_")) {
  // PRD §13.5 / brief §7: sandbox only. Refuse to boot with a live key.
  throw new Error(
    "Balance refuses to start with a live Stripe key. Use a sandbox (sk_test_…) key.",
  );
}

export const env = {
  appUrl: process.env.APP_URL?.replace(/\/$/, "") || `http://localhost:${process.env.PORT || 3000}`,
  stripeSecretKey: stripeKey,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || "",
  stripePlanPriceId: process.env.STRIPE_SOCIETY_PLAN_PRICE_ID?.trim() || "",
  /** "stripe" uses real Stripe Issuing (sandbox); anything else uses the local MockAdapter. */
  issuingMode: (process.env.ISSUING_MODE === "stripe" && stripeKey ? "stripe" : "mock") as
    | "stripe"
    | "mock",
  openRouterKey: process.env.OPENROUTER_API_KEY?.trim() || "",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
  jevModel: process.env.JEV_MODEL?.trim() || "anthropic/claude-haiku-5.5",
  jevTimeoutMs: Number(process.env.JEV_TIMEOUT_MS || 8000),
  dbPath: process.env.BALANCE_DB_PATH || "data/balance.db",
};

export const stripeEnabled = () => Boolean(env.stripeSecretKey);
export const jevEnabled = () => Boolean(env.openRouterKey);

export const SOCIETY_PLAN = {
  name: "Society Plan",
  amountCents: 4900,
  currency: "eur",
  interval: "year" as const,
  perks: [
    "Up to 10 active event cards at once",
    "JEV risk analysis on every purchase",
    "Public sponsor top-up page + QR code",
    "Live ledger that reconciles itself",
  ],
};
