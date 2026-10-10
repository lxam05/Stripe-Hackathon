import Image from "next/image";
import { Check, CircleCheck } from "lucide-react";
import { SubscribeButton } from "@/components/subscribe-button";
import { Notice, PageHeader, Panel, Pill, SectionTitle } from "@/components/ui";
import { SOCIETY_PLAN, stripeEnabled } from "@/lib/env";
import { requireMember } from "@/lib/guard";
import { fmtDate, fmtEur } from "@/lib/money";
import { confirmCheckoutSession } from "@/lib/payments";
import { getSociety } from "@/lib/queries";
import { getDb } from "@/lib/db";

export const metadata = { title: "Plan" };

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const actor = await requireMember();
  const sp = await searchParams;
  // Returning from Stripe Checkout: confirm server-side (works even before the webhook lands).
  if (typeof sp.session_id === "string") {
    try {
      await confirmCheckoutSession(sp.session_id);
    } catch {
      /* the webhook will catch up */
    }
  }
  const soc = getSociety(actor.societyId)!;
  const active = soc.plan_status === "active";
  const activation = getDb()
    .prepare(`SELECT * FROM audit_log WHERE action='plan.activated' AND target=? ORDER BY id DESC LIMIT 1`)
    .get(soc.id) as { at: string; actor: string; details: string } | undefined;
  const details = activation ? (JSON.parse(activation.details) as { subscription?: string; invoice?: string }) : null;

  return (
    <>
      <PageHeader eyebrow={soc.name} title="Society Plan">
        One plan per society, per academic year. Committees change every September, so you decide once, at handover.
      </PageHeader>

      {sp.canceled && (
        <div className="mb-6">
          <Notice tone="info" title="Checkout cancelled">
            No payment was taken. You can subscribe whenever you&rsquo;re ready.
          </Notice>
        </div>
      )}
      {active && (sp.activated || sp.session_id) && (
        <div className="mb-6">
          <Notice tone="ok" title="You're subscribed. Card issuing is unlocked.">
            {stripeEnabled() ? "Stripe confirmed the first payment" : "Simulated checkout completed"}; the plan is active until {fmtDate(soc.plan_renews_at!)}.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-stone p-7 text-white shadow-[var(--shadow-lift)]">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-coral/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-mint/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-mint">Balance {SOCIETY_PLAN.name}</span>
              {active ? (
                <Pill className="bg-white/15 text-white">
                  <CircleCheck className="h-3.5 w-3.5" /> Active
                </Pill>
              ) : (
                <Pill className="bg-butter text-[#5a3f08]">{soc.plan_status === "expired" ? "Expired" : "Not subscribed"}</Pill>
              )}
            </div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="display text-7xl tabular">{fmtEur(SOCIETY_PLAN.amountCents).replace(".00", "")}</span>
              <span className="text-white/70">/ year, per society</span>
            </div>
            <p className="mt-1 text-sm text-white/70">Billed in EUR. Test mode: use card 4242 4242 4242 4242.</p>
            <ul className="mt-6 space-y-2.5">
              {SOCIETY_PLAN.perks.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mint/25">
                    <Check className="h-3.5 w-3.5 text-mint" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              {active ? (
                <p className="text-sm text-white/80">Renews {fmtDate(soc.plan_renews_at!)}.</p>
              ) : actor.role === "treasurer" ? (
                <SubscribeButton />
              ) : (
                <p className="text-sm text-white/80">Ask your treasurer to renew the plan.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Panel>
            <SectionTitle>Why yearly?</SectionTitle>
            <p className="text-sm leading-relaxed text-ink-2">
              Societies run on the academic year and elect a new committee every spring. A single yearly decision fits the treasurer
              handover, costs less than one late reimbursement causes in stress, and sits comfortably inside a Societies Council grant.
            </p>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-paper-2 p-3 text-sm">
              <Image src="/art/persona-treasurer.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
              <span className="text-ink-2">
                <b className="font-medium text-ink">€49 ≈ €4 a month</b>, or about €5 an event for a society running ~10 events a year.
              </span>
            </div>
          </Panel>
          <Panel>
            <SectionTitle>Billing</SectionTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-3">Checkout</dt>
              <dd>{stripeEnabled() ? "Stripe Checkout (sandbox), mode=subscription" : "Simulated checkout (no Stripe keys configured)"}</dd>
              <dt className="text-ink-3">Status</dt>
              <dd className="capitalize">{soc.plan_status}</dd>
              {soc.stripe_subscription_id && (
                <>
                  <dt className="text-ink-3">Subscription</dt>
                  <dd className="truncate font-mono text-xs">{soc.stripe_subscription_id}</dd>
                </>
              )}
              {details?.invoice && (
                <>
                  <dt className="text-ink-3">First invoice</dt>
                  <dd className="truncate font-mono text-xs">{details.invoice} · paid</dd>
                </>
              )}
              {activation && (
                <>
                  <dt className="text-ink-3">Activated by</dt>
                  <dd>
                    {activation.actor === "webhook" ? "Stripe webhook" : activation.actor === "mock_checkout" ? "Simulated checkout" : "Checkout confirmation"} · {fmtDate(activation.at)}
                  </dd>
                </>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
