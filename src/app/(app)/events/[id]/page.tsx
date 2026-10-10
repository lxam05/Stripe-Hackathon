import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { CloseEventButton, EventCards } from "@/components/event-actions";
import { TxnList } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { Notice, PageHeader, Panel, SectionTitle, button } from "@/components/ui";
import { EventCover } from "@/components/virtual-card";
import { requireActor } from "@/lib/guard";
import { EVENT_TYPES } from "@/lib/mcc";
import { addDays, fmtDate, fmtEur } from "@/lib/money";
import { getEvent, getSociety, listCards, listTransactions } from "@/lib/queries";
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
  const pendingJev = txns.some((t) => t.ra_status === "pending");
  const typeLabel = EVENT_TYPES.find((t) => t.value === e.type)?.label ?? e.type;
  const open = e.status === "open";
  const editable = open && canManage(actor);
  const societyCards = listCards({ societyId: e.society_id, usable: true });
  const onEvent = e.cards.filter((c) => c.status === "active" || c.status === "inactive");
  const simCard = onEvent.find((c) => c.status === "active");

  return (
    <>
      <AutoRefresh active={pendingJev} />
      <PageHeader
        eyebrow={`${soc.name} · ${typeLabel}`}
        title={e.name}
        actions={
          <>
            <Link href="/events" className={button("ghost")}>
              <ArrowLeft className="h-4 w-4" /> Events
            </Link>
            {open && simCard && (
              <Link href={`/simulator?card=${simCard.id}`} className={button("secondary")}>
                <CreditCard className="h-4 w-4" /> Simulate a purchase
              </Link>
            )}
          </>
        }
      >
        {fmtDate(e.start_date)}
        {e.end_date !== e.start_date && <> → {fmtDate(e.end_date)}</>} · {e.expected_attendees} expected · {open ? "Open" : "Closed"}
      </PageHeader>

      {sp.created && (
        <div className="mb-6">
          {onEvent.length ? (
            <Notice tone="ok" title="Event created">
              {onEvent.map((c) => `${c.holder_name}'s card`).join(" and ")} now {onEvent.length === 1 ? "spends" : "spend"} from this {fmtEur(e.budget_cents)} budget.
            </Notice>
          ) : (
            <Notice tone="info" title="Event created">
              No officer card is spending for it yet. Switch one on below.
            </Notice>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <EventCover name={e.name} type={e.type} typeLabel={typeLabel} size="md" />
          <Panel>
            <SectionTitle aside={open ? `${onEvent.length} on this event` : undefined}>Officer cards</SectionTitle>
            {open ? (
              <EventCards eventId={e.id} cards={societyCards} editable={editable} />
            ) : (
              <p className="text-sm text-ink-3">The event is closed. Its cards went back to general spending.</p>
            )}
            {editable && (
              <p className="mt-3 text-xs text-ink-3">
                A card spends for one event at a time. Manage review thresholds on <Link href="/cards" className="underline hover:text-ink">Officer cards</Link>.
              </p>
            )}
          </Panel>
          <Panel>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-ink-3">Suggested spending window</dt>
              <dd className="text-right tabular">
                {fmtDate(addDays(e.start_date, -14))} → {fmtDate(addDays(e.end_date, 3))}
              </dd>
              <dt className="text-ink-3">Budget</dt>
              <dd className="text-right tabular">{fmtEur(e.budget_cents)}</dd>
              <dt className="text-ink-3">Expected</dt>
              <dd className="text-right tabular">{e.expected_attendees} people</dd>
            </dl>
            {e.notes && <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">“{e.notes}”</p>}
            {editable && (
              <div className="mt-4 border-t border-line pt-3">
                <CloseEventButton eventId={e.id} />
              </div>
            )}
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
            <TxnList rows={txns} showEvent={false} empty="No purchases for this event yet. Try the purchase simulator." />
          </Panel>
        </div>
      </div>
    </>
  );
}
