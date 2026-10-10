import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { CardActions } from "@/components/card-actions";
import { TxnList } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { CardStatusPill, Notice, PageHeader, Panel, SectionTitle, button } from "@/components/ui";
import { VirtualCard } from "@/components/virtual-card";
import { requireActor } from "@/lib/guard";
import { EVENT_TYPES } from "@/lib/mcc";
import { addDays, fmtDate, fmtEur } from "@/lib/money";
import { getEvent, getSociety, listTransactions } from "@/lib/queries";
import { canManage } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/events/[id]">) {
  const e = getEvent((await params).id);
  return { title: e?.name ?? "Event" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/events/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const e = getEvent(id);
  if (!e || (actor.kind === "member" && actor.societyId !== e.society_id)) notFound();
  const soc = getSociety(e.society_id)!;
  const txns = listTransactions({ eventId: e.id, limit: 100 });
  const card = e.card;
  const pendingJev = txns.some((t) => t.ra_status === "pending");

  return (
    <>
      <AutoRefresh active={pendingJev} />
      <PageHeader
        eyebrow={`${soc.name} · ${EVENT_TYPES.find((t) => t.value === e.type)?.label}`}
        title={e.name}
        actions={
          <>
            <Link href="/events" className={button("ghost")}>
              <ArrowLeft className="h-4 w-4" /> Events
            </Link>
            {e.status === "open" && card?.status === "active" && (
              <Link href={`/simulator?card=${card.id}`} className={button("secondary")}>
                <CreditCard className="h-4 w-4" /> Simulate a purchase
              </Link>
            )}
          </>
        }
      >
        {fmtDate(e.start_date)}
        {e.end_date !== e.start_date && <> → {fmtDate(e.end_date)}</>} · {e.expected_attendees} expected · {e.status === "open" ? "Open" : "Closed"}
      </PageHeader>

      {sp.created && card?.status === "active" && (
        <div className="mb-6">
          <Notice tone="ok" title={`Card issued to ${card.holder_name}`}>
            Ending {card.last4}. It works for this event only, up to {fmtEur(e.budget_cents)}.
          </Notice>
        </div>
      )}
      {card?.status === "pending" && (
        <div className="mb-6">
          <Notice tone="warn" title="The event is saved but the card isn't issued yet">
            {card.error ?? "The card network didn't respond."} Use “Retry issuing” below. Nothing has been charged.
          </Notice>
        </div>
      )}
      {card?.status === "inactive" && card.status_reason && (
        <div className="mb-6">
          <Notice tone="info" title="Card frozen">
            {card.status_reason}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          {card && (
            <VirtualCard eventName={e.name} eventType={e.type} societyName={soc.name} holder={card.holder_name ?? ""} last4={card.last4} expMonth={card.exp_month} expYear={card.exp_year} status={card.status} network={card.network} />
          )}
          {card && (
            <CardActions cardId={card.id} eventId={e.id} cardStatus={card.status} eventStatus={e.status} canManage={canManage(actor)} />
          )}
          <Panel>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-ink-3">Card</dt>
              <dd className="text-right">{card ? <CardStatusPill status={card.status} /> : "—"}</dd>
              <dt className="text-ink-3">Cardholder</dt>
              <dd className="text-right">{card?.holder_name}</dd>
              <dt className="text-ink-3">Per-purchase cap</dt>
              <dd className="text-right tabular">{card ? fmtEur(card.per_auth_cap_cents) : "—"}</dd>
              <dt className="text-ink-3">Valid</dt>
              <dd className="text-right tabular">
                {fmtDate(addDays(e.start_date, -14))} → {fmtDate(addDays(e.end_date, 3))}
              </dd>
              <dt className="text-ink-3">Network</dt>
              <dd className="text-right">{card?.network === "stripe" ? "Stripe Issuing (sandbox)" : "Simulated (MockAdapter)"}</dd>
            </dl>
            {e.notes && <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">“{e.notes}”</p>}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel>
            <div className="mb-4 flex items-baseline justify-between">
              <SectionTitle>Budget</SectionTitle>
              <span className="display text-3xl tabular">{fmtEur(e.remaining)} <span className="text-base text-ink-3">left</span></span>
            </div>
            <BudgetBar budget={e.budget_cents} spent={e.spent} held={e.held} />
          </Panel>
          <Panel pad={false}>
            <div className="px-5 pb-1 pt-5">
              <SectionTitle aside={`${txns.length} purchase${txns.length === 1 ? "" : "s"}`}>Purchases</SectionTitle>
            </div>
            <TxnList rows={txns} showEvent={false} empty="No purchases on this card yet. Try the purchase simulator." />
          </Panel>
        </div>
      </div>
    </>
  );
}
