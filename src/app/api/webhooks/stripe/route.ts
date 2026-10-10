import { NextResponse } from "next/server";
import Stripe from "stripe";
import { captureAuthorization, decideAuthorization, releaseAuthorization } from "@/lib/authorize";
import { enqueueAssessment } from "@/lib/assess";
import { getDb, newId, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { suspendPlanCards } from "@/lib/cards";
import { mccInfo } from "@/lib/mcc";
import { activatePlan, activatePlanFromSession, fulfilTopUp, fulfilCardSlot } from "@/lib/payments";
import { postEntry } from "@/lib/ledger";
import { getStripe } from "@/lib/stripe";
import { apiError } from "@/lib/api";

// Single, signature-verified endpoint for every Stripe event (PRD §9.2).
// Handlers are idempotent, return 2xx quickly, and ignore unknown events.

export async function POST(req: Request) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    return apiError(503, "stripe_not_configured", "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to receive webhooks.");
  }
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig ?? "", env.stripeWebhookSecret);
  } catch {
    // F3: bad signature → 400, nothing written.
    return apiError(400, "bad_signature", "Webhook signature verification failed.");
  }

  // Real-time authorisation: must answer inside Stripe's window with {approved}.
  if (event.type === "issuing_authorization.request") {
    const auth = event.data.object as Stripe.Issuing.Authorization;
    const card = getDb().prepare(`SELECT id FROM card WHERE stripe_card_id=?`).get(auth.card.id) as { id: string } | undefined;
    const amount = auth.pending_request?.amount ?? auth.amount;
    const d = card
      ? decideAuthorization({
          cardId: card.id,
          amountCents: amount,
          merchantName: auth.merchant_data.name ?? "Unknown merchant",
          mcc: auth.merchant_data.category_code,
          merchantCity: auth.merchant_data.city ?? "",
          merchantCountry: auth.merchant_data.country ?? "IE",
          at: authTime(card.id, auth),
          stripeAuthId: auth.id,
          currency: auth.currency,
        })
      : null;
    if (d?.authorizationId) enqueueAssessment(d.authorizationId);
    return NextResponse.json(
      { approved: Boolean(d?.approved), metadata: { balance_decision: d?.declineCode ?? (d?.approved ? "approved" : "unknown_card") } },
      // Stripe rejects the answer (webhook_error) unless this names a valid API version.
      { status: 200, headers: { "Stripe-Version": event.api_version || Stripe.API_VERSION } },
    );
  }

  const db = getDb();
  const fresh = db
    .prepare(`INSERT OR IGNORE INTO webhook_event (stripe_event_id, type, processed_at) VALUES (?,?,?)`)
    .run(event.id, event.type, nowIso());
  if (fresh.changes === 0) return NextResponse.json({ received: true, duplicate: true }); // F4 replay

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "topup" && s.payment_status === "paid") fulfilTopUp(s.id, "webhook");
        if (s.metadata?.kind === "plan" && s.payment_status === "paid") await activatePlanFromSession(s.id, "webhook");
        if (s.metadata?.kind === "card_slot" && s.payment_status === "paid") fulfilCardSlot(s.id,"webhook");
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.kind === "topup" && s.payment_status === "paid") fulfilTopUp(s.id, "webhook");
        if (s.metadata?.kind === "card_slot" && s.payment_status === "paid") fulfilCardSlot(s.id,"webhook");
        if (s.metadata?.kind === "plan" && s.payment_status === "paid") await activatePlanFromSession(s.id,"webhook");
        break;
      }
      case "checkout.session.async_payment_failed": {
        const s=event.data.object as Stripe.Checkout.Session;
        db.prepare(`UPDATE card_slot_purchase SET status='failed' WHERE checkout_session_id=? AND status!='paid'`).run(s.id);
        break;
      }
      case "invoice.payment_failed": {
        const inv=event.data.object as Stripe.Invoice;
        const sub=inv.parent?.subscription_details?.subscription;
        const subId=typeof sub === "string" ? sub : sub?.id;
        const soc=db.prepare(`SELECT id FROM society WHERE stripe_subscription_id=?`).get(subId ?? "") as {id:string} | undefined;
        if(soc){db.prepare(`UPDATE society SET plan_status='expired' WHERE id=?`).run(soc.id);await suspendPlanCards(soc.id,"webhook");}
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const line = inv.lines?.data?.[0];
        const societyId = (line?.metadata?.society_id as string | undefined) ?? (inv.parent?.subscription_details?.metadata?.society_id as string | undefined);
        if (societyId) {
          await activatePlan(societyId, {
            customerId: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
            subscriptionId: (inv.parent?.subscription_details?.subscription as string | undefined) ?? null,
            renewsAt: line?.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
            invoiceId: inv.id ?? null,
            source: "webhook",
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        db.prepare(`UPDATE society SET plan_status='expired' WHERE stripe_subscription_id=?`).run(sub.id);
        const soc = db.prepare(`SELECT id FROM society WHERE stripe_subscription_id=?`).get(sub.id) as { id: string } | undefined;
        if (soc) await suspendPlanCards(soc.id, "webhook");
        break;
      }
      case "issuing_authorization.created": {
        const auth = event.data.object as Stripe.Issuing.Authorization;
        const known = db.prepare(`SELECT id FROM authorization WHERE stripe_auth_id=?`).get(auth.id) as { id: string } | undefined;
        if (!known && !auth.approved) recordNetworkDecline(auth);
        else if (known && !auth.approved) recordStripeOverride(known.id, auth);
        else if (known) enqueueAssessment(known.id);
        break;
      }
      case "issuing_authorization.updated": {
        const auth = event.data.object as Stripe.Issuing.Authorization;
        const known = db.prepare(`SELECT id FROM authorization WHERE stripe_auth_id=?`).get(auth.id) as { id: string } | undefined;
        if (known && (auth.status === "reversed" || auth.status === "expired")) {
          releaseAuthorization(known.id, nowIso(), auth.status === "expired" ? "expired" : "reversed");
        }
        break;
      }
      case "issuing_transaction.created": {
        const txn = event.data.object as Stripe.Issuing.Transaction;
        const authId = typeof txn.authorization === "string" ? txn.authorization : txn.authorization?.id;
        const known = authId
          ? (db.prepare(`SELECT id, society_id, event_id FROM authorization WHERE stripe_auth_id=?`).get(authId) as
              | { id: string; society_id: string; event_id: string | null }
              | undefined)
          : undefined;
        if (!known) break;
        if (txn.type === "capture") captureAuthorization(known.id, Math.abs(txn.amount), nowIso(), txn.id);
        if (txn.type === "refund") {
          postEntry({ societyId: known.society_id, eventId: known.event_id, type: "refund", amountCents: Math.abs(txn.amount), refType: "stripe_txn", refId: txn.id, at: nowIso() });
        }
        break;
      }
      case "issuing_card.updated": {
        const c = event.data.object as Stripe.Issuing.Card;
        db.prepare(`UPDATE card SET status=? WHERE stripe_card_id=? AND status != 'canceled'`).run(c.status, c.id);
        break;
      }
      default:
        break; // never throw on unknown events
    }
  } catch (err) {
    db.prepare(`DELETE FROM webhook_event WHERE stripe_event_id=?`).run(event.id); // let Stripe retry
    console.error("[webhook]", event.type, err);
    return apiError(500, "handler_failed", "Webhook handler failed; Stripe will retry.");
  }
  return NextResponse.json({ received: true });
}

/** When the purchase happened: the simulator's time override (set moments ago) or Stripe's timestamp. */
function authTime(cardId: string, auth: Stripe.Issuing.Authorization) {
  const o = getDb().prepare(`SELECT at FROM sim_override WHERE card_id=? AND created_at > ?`).get(cardId, new Date(Date.now() - 60_000).toISOString()) as
    | { at: string }
    | undefined;
  return o?.at ?? new Date(auth.created * 1000).toISOString();
}

/** We approved, but Stripe still declined (e.g. our answer arrived too late): release the hold. */
function recordStripeOverride(authId: string, auth: Stripe.Issuing.Authorization) {
  if (!releaseAuthorization(authId, nowIso())) return;
  const reason = auth.request_history?.at(-1)?.reason ?? "unknown";
  getDb()
    .prepare(`UPDATE authorization SET decision='declined', status='declined', decline_reason=? WHERE id=?`)
    .run(`Declined by Stripe after our approval (${reason})`, authId);
}

/** Stripe declined before asking us (card-level spending controls). Record it so the treasurer sees the attempt. */
function recordNetworkDecline(auth: Stripe.Issuing.Authorization) {
  const db = getDb();
  const card = db
    .prepare(`SELECT id, member_id, event_id, society_id FROM card WHERE stripe_card_id=?`)
    .get(auth.card.id) as { id: string; member_id: string; event_id: string | null; society_id: string } | undefined;
  if (!card) return;
  const reason = auth.request_history?.[0]?.reason ?? "spending_controls";
  const mcc = auth.merchant_data.category_code;
  const id = newId("auth");
  db.prepare(
    `INSERT INTO authorization (id, stripe_auth_id, card_id, event_id, society_id, member_id, amount_cents, merchant_name, mcc, mcc_group, merchant_city,
      merchant_country, created_at, decision, decline_reason, rules_score, rule_signals, status, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    auth.id,
    card.id,
    card.event_id,
    card.society_id,
    card.member_id,
    auth.amount || auth.merchant_amount,
    auth.merchant_data.name ?? "Unknown merchant",
    mcc,
    mccInfo(mcc).group,
    auth.merchant_data.city ?? "",
    auth.merchant_data.country ?? "IE",
    authTime(card.id, auth),
    "declined",
    `Declined by Stripe card controls (${reason})`,
    0,
    JSON.stringify([{ id: "H4", label: "Blocked by card controls", points: 0, hard: true, evidence: `Stripe declined: ${reason}` }]),
    "declined",
    "live",
  );
  enqueueAssessment(id);
}
