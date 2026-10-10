// Central configuration. Checkout can still use its labelled local simulation,
// but officer cards always require Stripe Issuing. JEV falls back to rules only.

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
  openRouterKey: process.env.OPENROUTER_API_KEY?.trim() || "",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1",
  jevModel: process.env.JEV_MODEL?.trim() || "typesafe/jev-1.13",
  /** Optional chat-capable OpenRouter model used only for editable annual-report prose. */
  grantDraftModel: process.env.GRANT_DRAFT_MODEL?.trim() || "",
  jevTimeoutMs: Number(process.env.JEV_TIMEOUT_MS || 3000),
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
    "5 committee cards; extra slots €10 each for the remaining plan year",
    "Post-payment reviews, recurring approvals and member expenses",
    "Annual spending report and Council grant review",
    "AI risk checks on every purchase",
    "Public sponsor top-up page + QR code",
    "Live ledger that reconciles itself",
  ],
};
