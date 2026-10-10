import { notFound, redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/logo";
import { MockPay } from "@/components/mock-pay";
import { getDb } from "@/lib/db";
import { SOCIETY_PLAN, stripeEnabled } from "@/lib/env";
import { fmtEur } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Simulated checkout" };

/**
 * Stand-in for Stripe Checkout when no Stripe keys are configured. It never asks for
 * card details; "Pay" calls the same fulfilment code the Stripe webhook uses.
 */
export default async function MockCheckout({ params }: PageProps<"/checkout/mock/[session]">) {
  if (stripeEnabled()) redirect("/");
  const { session } = await params;
  const db = getDb();
  let title: string;
  let amount: number;
  let sub = "";
  let cancelHref: string;
  if (session.startsWith("mock_slot_")) {
    const slot=db.prepare(`SELECT p.*,s.name FROM card_slot_purchase p JOIN society s ON s.id=p.society_id WHERE checkout_session_id=?`).get(session) as {name:string;expires_at:string}|undefined;
    if(!slot)notFound(); title=`Extra card slot · ${slot.name}`;amount=1000;sub=`Until ${slot.expires_at.slice(0,10)} · no automatic renewal`;cancelHref="/plan?canceled=1";
  } else if (session.startsWith("mock_plan_")) {
    const soc = db.prepare(`SELECT name FROM society WHERE id=?`).get(session.slice(10)) as { name: string } | undefined;
    if (!soc) notFound();
    title = `Balance ${SOCIETY_PLAN.name} · ${soc.name}`;
    amount = SOCIETY_PLAN.amountCents;
    sub = "per year · renews automatically";
    cancelHref = "/plan?canceled=1";
  } else {
    const t = db
      .prepare(`SELECT t.*, s.name sname, s.slug FROM topup t JOIN society s ON s.id=t.society_id WHERE t.checkout_session_id=?`)
      .get(session) as { amount_cents: number; sname: string; slug: string; id: string; status: string } | undefined;
    if (!t) notFound();
    if (t.status === "paid") redirect(`/s/${t.slug}/topup/success?session_id=${session}`);
    title = `Top-up for ${t.sname}`;
    amount = t.amount_cents;
    cancelHref = `/s/${t.slug}/topup/cancel?topup=${t.id}`;
  }

  return (
    <div className="min-h-screen bg-paper-2">
      <div className="bg-butter/50 px-4 py-2 text-center text-[13px] text-[#5a3f08]">
        <FlaskConical className="mr-1 inline h-4 w-4" /> Simulated checkout. Stripe keys aren&rsquo;t configured, so no card details are collected. Add <code>STRIPE_SECRET_KEY</code> for real Stripe Checkout.
      </div>
      <main className="mx-auto grid max-w-[920px] gap-8 px-5 py-12 md:grid-cols-2">
        <section>
          <Logo size={24} />
          <p className="mt-8 text-sm text-ink-3">Pay</p>
          <p className="display text-5xl tabular">{fmtEur(amount)}</p>
          {sub && <p className="text-sm text-ink-3">{sub}</p>}
          <div className="mt-6 flex justify-between border-t border-line pt-4 text-sm">
            <span>{title}</span>
            <span className="tabular">{fmtEur(amount)}</span>
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <p className="text-sm font-medium">Payment method</p>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-line-strong bg-white px-4 py-3 text-sm">
            <span className="font-mono tracking-wider">Sandbox test card •••• 4242</span>
            <span className="text-ink-3">12/34</span>
          </div>
          <MockPay session={session} cancelHref={cancelHref} amountLabel={fmtEur(amount)} />
        </section>
      </main>
    </div>
  );
}
