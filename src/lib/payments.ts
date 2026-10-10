import { audit, getDb, newId, nowIso } from "./db";
import { env, SOCIETY_PLAN, stripeEnabled } from "./env";
import { postEntry } from "./ledger";
import { fmtEur } from "./money";
import { getStripe } from "./stripe";

// Stripe Checkout (PRD §6.1, §9.4). With STRIPE_SECRET_KEY set these create real
// sandbox Checkout Sessions. Without it, a clearly-labelled simulated checkout
// exercises exactly the same fulfilment code path.

export const TOPUP_MIN_CENTS = 500;
export const TOPUP_MAX_CENTS = 1_000_000;

export class UserError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface SocietyRow {
  id: string;
  name: string;
  slug: string;
  plan_status: string;
  stripe_customer_id: string | null;
}

export function validateTopUpAmount(cents: number) {
  if (!Number.isInteger(cents)) throw new UserError("invalid_amount", "Enter an amount in euro, e.g. 50 or 49.99.");
  if (cents < TOPUP_MIN_CENTS) throw new UserError("amount_too_small", `The minimum top-up is ${fmtEur(TOPUP_MIN_CENTS)}.`);
  if (cents > TOPUP_MAX_CENTS) throw new UserError("amount_too_large", `The maximum top-up is ${fmtEur(TOPUP_MAX_CENTS)}. For larger gifts, contact the Societies Office.`);
}

export async function createTopUpCheckout(input: {
  societySlug: string;
  amountCents: number;
  payerName: string;
  message?: string;
  showPublicly?: boolean;
  payerType?: "sponsor" | "ucd";
}): Promise<{ url: string; topupId: string }> {
  validateTopUpAmount(input.amountCents);
  const payerName = input.payerName.trim().slice(0, 80);
  if (!payerName) throw new UserError("missing_name", "Tell the society who this is from.");
  const db = getDb();
  const soc = db.prepare(`SELECT * FROM society WHERE slug=?`).get(input.societySlug) as SocietyRow | undefined;
  if (!soc) throw new UserError("unknown_society", "We couldn't find that society.", 404);

  const topupId = newId("top");
  db.prepare(
    `INSERT INTO topup (id, society_id, payer_type, payer_name, message, show_publicly, amount_cents, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(topupId, soc.id, input.payerType ?? "sponsor", payerName, (input.message ?? "").slice(0, 280), input.showPublicly ? 1 : 0, input.amountCents, "pending", nowIso());

  if (!stripeEnabled()) {
    const sessionId = `mock_cs_${topupId}`;
    db.prepare(`UPDATE topup SET checkout_session_id=? WHERE id=?`).run(sessionId, topupId);
    return { url: `/checkout/mock/${sessionId}`, topupId };
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    currency: "eur",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: input.amountCents,
          product_data: { name: `Top-up for ${soc.name}`, description: "Credited to the society's Balance budget" },
        },
      },
    ],
    metadata: { kind: "topup", society_id: soc.id, topup_id: topupId, sponsor_name: payerName },
    payment_intent_data: { metadata: { kind: "topup", topup_id: topupId } },
    success_url: `${env.appUrl}/s/${soc.slug}/topup/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/s/${soc.slug}/topup/cancel?topup=${topupId}`,
  });
  db.prepare(`UPDATE topup SET checkout_session_id=? WHERE id=?`).run(session.id, topupId);
  return { url: session.url!, topupId };
}

/** Idempotent on checkout_session_id (test F4): credits the ledger exactly once. */
export function fulfilTopUp(sessionId: string, source: string): { credited: boolean; topupId: string | null } {
  const db = getDb();
  return db
    .transaction(() => {
      const t = db.prepare(`SELECT * FROM topup WHERE checkout_session_id=?`).get(sessionId) as
        | { id: string; society_id: string; amount_cents: number; status: string; payer_name: string }
        | undefined;
      if (!t) return { credited: false, topupId: null };
      if (t.status === "paid") return { credited: false, topupId: t.id };
      const at = nowIso();
      db.prepare(`UPDATE topup SET status='paid', paid_at=? WHERE id=?`).run(at, t.id);
      postEntry({
        societyId: t.society_id,
        type: "topup",
        amountCents: t.amount_cents,
        refType: "topup",
        refId: t.id,
        memo: t.payer_name,
        at,
      });
      audit(source, "topup.paid", t.id, { session_id: sessionId, amount_cents: t.amount_cents });
      return { credited: true, topupId: t.id };
    })
    .immediate();
}

export function cancelTopUp(topupId: string) {
  getDb().prepare(`UPDATE topup SET status='canceled' WHERE id=? AND status='pending'`).run(topupId);
}

/** Server-side confirmation used by the success page (works even without `stripe listen`). */
export async function confirmCheckoutSession(sessionId: string) {
  if (sessionId.startsWith("mock_cs_")) {
    const t = getDb().prepare(`SELECT status FROM topup WHERE checkout_session_id=?`).get(sessionId) as { status: string } | undefined;
    return { paid: t?.status === "paid" };
  }
  if (!stripeEnabled()) return { paid: false };
  const s = await getStripe().checkout.sessions.retrieve(sessionId);
  if (s.metadata?.kind === "topup" && s.payment_status === "paid") {
    fulfilTopUp(s.id, "checkout.success_page");
    return { paid: true };
  }
  if (s.metadata?.kind === "plan" && s.status === "complete") {
    await activatePlanFromSession(s.id, "checkout.success_page");
    return { paid: true };
  }
  return { paid: false };
}

// ── Society Plan subscription (Stripe bonus, §9.4 option A) ───────────────────

export async function createPlanCheckout(societyId: string): Promise<{ url: string }> {
  const db = getDb();
  const soc = db.prepare(`SELECT * FROM society WHERE id=?`).get(societyId) as SocietyRow | undefined;
  if (!soc) throw new UserError("unknown_society", "Society not found", 404);
  if (soc.plan_status === "active") throw new UserError("already_active", "This society's plan is already active.");

  if (!stripeEnabled()) {
    return { url: `/checkout/mock/mock_plan_${soc.id}` };
  }
  const priceLine = env.stripePlanPriceId
    ? { price: env.stripePlanPriceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: SOCIETY_PLAN.currency,
          unit_amount: SOCIETY_PLAN.amountCents,
          recurring: { interval: SOCIETY_PLAN.interval },
          product_data: { name: `Balance ${SOCIETY_PLAN.name}`, description: "Academic-year access for one society" },
        },
      };
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [priceLine],
    client_reference_id: soc.id,
    metadata: { kind: "plan", society_id: soc.id },
    subscription_data: { metadata: { kind: "plan", society_id: soc.id } },
    success_url: `${env.appUrl}/plan?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/plan?canceled=1`,
  });
  return { url: session.url! };
}

export async function activatePlanFromSession(sessionId: string, source: string) {
  const s = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription", "invoice"] });
  if (s.status !== "complete" || s.metadata?.kind !== "plan") return false;
  const sub = s.subscription && typeof s.subscription === "object" ? s.subscription : null;
  const invoice = s.invoice && typeof s.invoice === "object" ? s.invoice : null;
  const periodEnd = sub?.items?.data?.[0]?.current_period_end;
  activatePlan(s.metadata!.society_id!, {
    customerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
    subscriptionId: sub?.id ?? (typeof s.subscription === "string" ? s.subscription : null),
    renewsAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    invoiceId: invoice?.id ?? null,
    source,
  });
  return true;
}

export function activatePlan(
  societyId: string,
  p: { customerId: string | null; subscriptionId: string | null; renewsAt: string | null; invoiceId?: string | null; source: string },
) {
  const db = getDb();
  const renews = p.renewsAt ?? new Date(Date.now() + 365 * 86400_000).toISOString();
  const r = db
    .prepare(
      `UPDATE society SET plan_status='active', plan_renews_at=?, stripe_customer_id=COALESCE(?, stripe_customer_id),
         stripe_subscription_id=COALESCE(?, stripe_subscription_id) WHERE id=?`,
    )
    .run(renews, p.customerId, p.subscriptionId, societyId);
  if (r.changes) audit(p.source, "plan.activated", societyId, { subscription: p.subscriptionId, invoice: p.invoiceId });
}

/** Simulated checkout completion (no Stripe keys): same fulfilment functions as the webhook. */
export function completeMockCheckout(sessionId: string) {
  if (sessionId.startsWith("mock_plan_")) {
    const societyId = sessionId.slice("mock_plan_".length);
    activatePlan(societyId, {
      customerId: `mock_cus_${societyId}`,
      subscriptionId: `mock_sub_${societyId}`,
      renewsAt: null,
      invoiceId: "mock_in_first",
      source: "mock_checkout",
    });
    return { kind: "plan" as const, redirect: "/plan?activated=1" };
  }
  const res = fulfilTopUp(sessionId, "mock_checkout");
  const t = getDb()
    .prepare(`SELECT s.slug FROM topup t JOIN society s ON s.id=t.society_id WHERE t.checkout_session_id=?`)
    .get(sessionId) as { slug: string } | undefined;
  if (!t || !res.topupId) throw new UserError("unknown_session", "This checkout session doesn't exist.", 404);
  return { kind: "topup" as const, redirect: `/s/${t.slug}/topup/success?session_id=${sessionId}` };
}
