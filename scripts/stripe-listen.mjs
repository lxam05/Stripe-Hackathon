// Forward sandbox Stripe events to the local webhook. Uses STRIPE_SECRET_KEY from .env, so
// no `stripe login` is needed. Copy the printed whsec_… into STRIPE_WEBHOOK_SECRET once.
//   npm run stripe:listen
import { spawn } from "node:child_process";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env first.");
  process.exit(1);
}

// Every event src/app/api/webhooks/stripe/route.ts handles.
const EVENTS = [
  "issuing_authorization.request",
  "issuing_authorization.created",
  "issuing_authorization.updated",
  "issuing_transaction.created",
  "issuing_card.updated",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
];

const port = process.env.PORT || 3000;
// One command string: the CLI is a .cmd shim on Windows, so it needs a shell, and none of
// these arguments need escaping.
const child = spawn(`stripe listen --forward-to localhost:${port}/api/webhooks/stripe --events ${EVENTS.join(",")}`, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, STRIPE_API_KEY: key },
});
child.on("exit", (code) => process.exit(code ?? 0));
