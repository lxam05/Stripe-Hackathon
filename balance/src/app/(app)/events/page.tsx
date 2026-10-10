import Link from "next/link";
import { Plus } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { CardStatusPill, EmptyState, PageHeader, Panel, SectionTitle, button } from "@/components/ui";
import { VirtualCard } from "@/components/virtual-card";
import { requireMember } from "@/lib/guard";
import { EVENT_TYPES } from "@/lib/mcc";
import { fmtDate, fmtEur } from "@/lib/money";
import { getSociety, listEvents } from "@/lib/queries";

export const metadata = { title: "Events & cards" };

export default async function EventsPage() {
  const actor = await requireMember();
  const soc = getSociety(actor.societyId)!;
  const open = listEvents(soc.id, "open");
  const closed = listEvents(soc.id, "closed");
  const typeLabel = (t: string) => EVENT_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <>
      <PageHeader
        eyebrow={soc.name}
        title="Events & cards"
        actions={
          actor.role === "treasurer" && (
            <Link href="/events/new" className={button("primary")}>
              <Plus className="h-4 w-4" /> New event
            </Link>
          )
        }
      >
        One virtual card per event. The budget, per-purchase cap and blocked categories travel with the card.
      </PageHeader>

      <SectionTitle aside={`${open.length} open`}>Open</SectionTitle>
      {open.length === 0 ? (
        <Panel className="mb-10">
          <EmptyState title="No open events" image="/art/persona-officer.webp" action={actor.role === "treasurer" && <Link href="/events/new" className={button("primary")}><Plus className="h-4 w-4" /> New event</Link>}>
            Create an event and Balance issues its card in seconds.
          </EmptyState>
        </Panel>
      ) : (
        <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {open.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              {e.card && (
                <VirtualCard size="sm" eventName={e.name} eventType={e.type} societyName={soc.name} holder={e.card.holder_name ?? ""} last4={e.card.last4} expMonth={e.card.exp_month} expYear={e.card.exp_year} status={e.card.status} network={e.card.network} />
              )}
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="text-ink-2">
                  {typeLabel(e.type)} · {fmtDate(e.start_date)}
                </span>
                {e.card && <CardStatusPill status={e.card.status} />}
              </div>
              <div className="mt-2.5">
                <BudgetBar budget={e.budget_cents} spent={e.spent} held={e.held} showLegend={false} thin />
                <div className="mt-1.5 text-xs text-ink-3 tabular">
                  {fmtEur(e.remaining)} of {fmtEur(e.budget_cents)} left
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <SectionTitle aside={`${closed.length} events`}>Past events</SectionTitle>
      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 text-right font-medium">Spent</th>
                <th className="px-3 py-3 text-right font-medium">Budget</th>
                <th className="w-40 px-5 py-3 font-medium">Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {closed.map((e) => (
                <tr key={e.id} className="hover:bg-paper-2/50">
                  <td className="px-5 py-2.5">
                    <Link href={`/events/${e.id}`} className="font-medium text-ink hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2 tabular">{fmtDate(e.start_date)}</td>
                  <td className="px-3 py-2.5 text-ink-2">{typeLabel(e.type)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{fmtEur(e.spent)}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{fmtEur(e.budget_cents)}</td>
                  <td className="px-5 py-2.5">
                    <BudgetBar budget={e.budget_cents} spent={e.spent} held={e.held} showLegend={false} thin />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
