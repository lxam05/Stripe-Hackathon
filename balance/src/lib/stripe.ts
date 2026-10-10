import Stripe from "stripe";
import { env } from "./env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!env.stripeSecretKey) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  if (!stripe) stripe = new Stripe(env.stripeSecretKey, { appInfo: { name: "Balance (HackUCD 2026)" } });
  return stripe;
}
