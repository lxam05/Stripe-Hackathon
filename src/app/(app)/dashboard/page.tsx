import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Lock, Plus, QrCode } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { SpendChart } from "@/components/spend-chart";
import { TxnList } from "@/components/txn-list";
import { EmptyState, PageHeader, Panel, SectionTitle, SeverityBadge, StatTile, button } from "@/components/ui";
import { CardHolders, EventCover, VirtualCard, roleArt } from "@/components/virtual-card";
import { requireMember } from "@/lib/guard";
import { dublinParts, fmtDate, fmtEur } from "@/lib/money";
import { getSociety, listCards, listEvents, listFlags, listTransactions, monthlySpend, societyOverview } from "@/lib/queries";
import { EVENT_TYPES } from "@/lib/mcc";
import { CARDS_PER_SOCIETY, ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Overview" };

export default async function Dashboard() {
  const actor = await requireMember();
  const soc = getSociety(actor.societyId)!;
  const o = societyOverview(soc.id);
  const open = listEvents(soc.id, "open");
  const cards = listCards({ societyId: soc.id });
  const flags = listFlags({ societyId: soc.id, status: "open" }).slice(0, 3);
  const txns = listTransactions({ societyId: soc.id, limit: 8 });
  const spend = monthlySpend(soc.id);
  const hour = dublinParts(new Date().toISOString()).hour;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const isTreasurer = actor.role === "treasurer";

  return (
    <>
      <PageHeader
        eyebrow={soc.name}
        title={
          <>
            {greeting}, {actor.name.split(" ")[0]}.
          </>
        }
        actions={
          isTreasurer && (
            <>
              <Link href={`/s/${soc.slug}/topup`} className={button("secondary")}>
                <QrCode className="h-4 w-4" /> Sponsor link
              </Link>
              <Link href="/events/new" className={button("primary")}>
                <Plus className="h-4 w-4" /> New event
              </Link>
            </>
          )
        }
      >
        {o.openFlags > 0 ? (
          <>
            <b className="font-semibold text-ink">{o.openFlags} purchase{o.openFlags === 1 ? "" : "s"}</b> need{o.openFlags === 1 ? "s" : ""} your attention. Everything else reconciles.
          </>
        ) : (
          "Nothing needs your attention. Every euro is tied to an event."
        )}
      </PageHeader>

      {soc.plan_status !== "active" && (
        <Link
          href="/plan"
          className="mb-6 flex items-center gap-4 rounded-2xl border border-butter bg-butter/25 px-5 py-4 transition hover:bg-butter/35"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-butter/60">
            <Lock className="h-5 w-5 text-[#6b4d12]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">Your 2025/26 Society Plan ended on {fmtDate(soc.plan_renews_at ?? "2026-09-30")}.</span>
            <span className="block text-sm text-ink-2">Your officer cards are frozen. Renew for 2026/27 (€49/year) to switch them back on. History and sponsor links keep working.</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-ink-2" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Available" cents={o.available} hint="Funded minus held and spent" />
        <StatTile label="Unallocated" cents={o.unallocated} hint={`${fmtEur(o.committed)} reserved for open events`} />
        <StatTile label="Held" cents={o.held} tone="held" hint="Authorised, not yet captured" />
        <StatTile label="Spent this term" cents={o.termSpent} tone="spent" hint="Since 1 Sept 2026" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-6">
          <div>
            <SectionTitle aside={<Link href="/events" className="hover:text-ink">All events →</Link>}>Open events</SectionTitle>
            {open.length === 0 ? (
              <Panel>
                <EmptyState
                  title="No open events"
                  image="/art/persona-officer.webp"
                  action={
                    isTreasurer && (
                      <Link href="/events/new" className={button("primary")}>
                        <Plus className="h-4 w-4" /> Create your first event
                      </Link>
                    )
                  }
                >
                  Create an event budget and point an officer card at it, so nobody fronts money.
                </EmptyState>
              </Panel>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((e) => (
                  <Link key={e.id} href={`/events/${e.id}`} className="group rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                    <EventCover name={e.name} type={e.type} typeLabel={EVENT_TYPES.find((t) => t.value === e.type)?.label ?? e.type} />
                    <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink-2">{fmtDate(e.start_date)}</span>
                      <CardHolders cards={e.cards} />
                    </div>
                    <div className="mt-1 flex items-baseline justify-end text-sm">
                      <span className="tabular text-ink-2">
                        <b className="font-semibold text-ink">{fmtEur(e.remaining)}</b> left
                      </span>
                    </div>
                    <div className="mt-2">
                      <BudgetBar budget={e.budget_cents} spent={e.spent} held={e.held} showLegend={false} thin />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionTitle aside={<Link href="/cards" className="hover:text-ink">{cards.length} of {CARDS_PER_SOCIETY} issued →</Link>}>Officer cards</SectionTitle>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {cards.map((c) => (
                <Link key={c.id} href="/cards" className="w-[220px] shrink-0 transition hover:-translate-y-0.5">
                  <VirtualCard
                    size="sm"
                    title={ROLE_LABEL[c.holder_role] ?? c.holder_role}
                    art={roleArt(c.holder_role)}
                    societyName={soc.name}
                    holder={c.holder_name}
                    last4={c.last4}
                    expMonth={c.exp_month}
                    expYear={c.exp_year}
                    status={c.status}
                    network={c.network}
                    tag={c.event_id && c.event_status === "open" ? `For ${c.event_name}` : "General spending"}
                  />
                </Link>
              ))}
              {cards.length < CARDS_PER_SOCIETY && isTreasurer && (
                <Link
                  href="/cards"
                  className="flex aspect-[1.586] w-[220px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-line-strong text-sm text-ink-3 hover:bg-surface"
                >
                  <Plus className="h-5 w-5" /> Issue a card
                </Link>
              )}
            </div>
          </div>

          <Panel pad={false}>
            <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">Recent purchases</h2>
              <Link href="/transactions" className="text-sm text-ink-3 hover:text-ink">
                All →
              </Link>
            </div>
            <TxnList rows={txns} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel>
            <SectionTitle aside={<Link href="/review" className="hover:text-ink">Queue →</Link>}>Needs review</SectionTitle>
            {flags.length === 0 ? (
              <div className="flex items-center gap-4">
                <Image src="/art/empty-clear.webp" alt="" width={120} height={90} className="feather" />
                <p className="text-sm text-ink-2">Nothing needs your attention. JEV will flag anything that doesn&rsquo;t fit.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {flags.map((f) => (
                  <li key={f.f_id}>
                    <Link href={`/transactions/${f.id}`} className="block rounded-xl border border-line p-3 hover:bg-paper-2/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink">{f.merchant_name}</span>
                        <span className="tabular font-medium">{fmtEur(f.amount_cents)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{f.ra_summary || f.f_reason}</p>
                      <div className="mt-2">
                        <SeverityBadge severity={f.f_severity} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <SectionTitle aside="2025/26 → now">Monthly spend</SectionTitle>
            <SpendChart data={spend} />
          </Panel>

          <Link href="/funding" className="group flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-lift)]">
            <Image src="/art/sponsor.webp" alt="" width={120} height={90} className="feather" />
            <div className="min-w-0">
              <div className="display text-xl text-ink">Share your sponsor link</div>
              <p className="text-sm text-ink-2">Sponsors pay by card through Stripe and the money lands in your ledger straight away.</p>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
