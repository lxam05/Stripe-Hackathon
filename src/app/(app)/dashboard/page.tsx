import Link from "next/link";
import { requireMember } from "@/lib/guard";
import type { MemberActor } from "@/lib/session";
import { isFinance, reportOwner } from "@/lib/access";
import { listExpenses,listReviews,listReports } from "@/lib/workflows";
import { getSociety,listCards,listEvents,listTransactions,monthlySpend } from "@/lib/queries";
import { societyBalances } from "@/lib/ledger";
import { cardCapacity, PLAN_LAPSED_REASON } from "@/lib/cards";
import { CreditCard } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { MonthBar } from "@/components/card-controls";
import { EventCover, VirtualCard, roleArt } from "@/components/virtual-card";
import { CardStatusPill, EmptyState, PageHeader,Panel,SectionTitle,StatTile,Notice,button } from "@/components/ui";
import { EVENT_TYPES } from "@/lib/mcc";
import { ROLE_LABEL } from "@/lib/roles";
import { SpendChart } from "@/components/spend-chart";
import { TxnList } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { dublinParts, fmtDate, fmtEur } from "@/lib/money";
export const metadata = { title: "Overview" };

/** Treasurer and senior treasurer see the society; every other member gets their own card and spending only. */
export default async function Dashboard() {
  const a=await requireMember();
  if (!isFinance(a)) return <OfficerHome actor={a} />;
  const s=getSociety(a.societyId)!,b=societyBalances(s.id);
  const reviews=listReviews(a).filter(r=>["pending","receipt_requested"].includes(r.status));
  const claims=listExpenses(a).filter(e=>["submitted","approved"].includes(e.status));
  const owner=reportOwner(s.id),reports=listReports(a),cards=listCards({societyId:s.id});
  const txns=listTransactions({societyId:s.id,limit:8});
  return <><AutoRefresh active ms={10000}/><PageHeader eyebrow={s.name} title={`Hello, ${a.name.split(" ")[0]}.`} actions={<Link href="/expenses" className={button("primary")}>Submit an expense</Link>}>Society spending without leaving members out of pocket. Keep payment reviews, reimbursements and annual reporting in one place.</PageHeader>
    {s.plan_status !== "active" && <div className="mb-6"><Notice tone="warn" title="Committee cards are paused"><Link className="underline" href="/plan">Renew the €49/year Society Plan</Link>. Expenses and reporting remain available.</Notice></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatTile label="Available society funds" cents={b.available} hint="Funded minus held and spent"/><StatTile label="Awaiting reimbursement" cents={claims.reduce((sum,e)=>sum+e.amount_cents,0)} hint="Claims are not yet debited"/><StatTile label="Card holds" cents={b.held} hint="Authorised, not yet settled"/><StatTile label="Recorded net spending" cents={b.spent}/></div>
    <div className="my-6 grid gap-4 md:grid-cols-3">{[
      {href:"/review",title:"Payment reviews",value:`${reviews.length} need attention`,body:"First-time payments and exceptions. Recurring matches are recorded automatically."},
      {href:"/expenses",title:"Member expenses",value:`${claims.length} awaiting repayment`,body:"Receipt-backed claims and external repayment tracking."},
      {href:"/reports",title:"Annual grant report",value:reports[0] ? `${reports[0].year}/${reports[0].year+1} · ${reports[0].status}` : "Ready to draft",body:`Reporting owner: ${owner?.name ?? "Not assigned"}. Council reviews evidence and the next-year estimate.`}
    ].map(x=><Link key={x.href} href={x.href} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] hover:bg-paper-2"><SectionTitle>{x.title}</SectionTitle><p className="display text-2xl">{x.value}</p><p className="mt-2 text-sm text-ink-2">{x.body}</p></Link>)}</div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Panel><SectionTitle aside={<Link href="/review">Open reviews →</Link>}>Next to review</SectionTitle>{reviews.length ? <ul className="divide-y divide-line">{reviews.slice(0,5).map(r=><li key={r.authorization_id} className="py-3"><Link href={`/transactions/${r.authorization_id}`} className="font-medium">{r.merchant_name} · {fmtEur(r.amount_cents)}</Link><p className="mt-1 text-sm text-ink-3">{r.reason}</p></li>)}</ul> : <p className="text-sm text-ink-2">No payment reviews outstanding.</p>}</Panel>
    <Panel><SectionTitle>Committee cards</SectionTitle><p className="display text-3xl">{cards.length} / {cardCapacity(s.id)} slots</p><p className="my-3 text-sm text-ink-2">Cards stay with their committee member across events. Thresholds trigger review, not a decline.</p><Link href="/cards" className={button("secondary")}>View cards</Link><p className="mt-4 text-xs text-ink-3">€49/year includes five slots · €10 per extra slot for the remaining plan year.</p></Panel></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Panel pad={false}><div className="p-5"><SectionTitle>Recent card payments</SectionTitle></div><TxnList rows={txns}/></Panel><Panel><SectionTitle>Recorded monthly spending</SectionTitle><SpendChart data={monthlySpend(s.id)}/></Panel></div>
  </>;
}

const greetingNow = () => {
  const hour = dublinParts(new Date().toISOString()).hour;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

/**
 * An officer's overview: their own card, its limits and this month's spend, the event it's
 * on, and their own purchases and flags. No society balances, funding or other officers.
 */
function OfficerHome({ actor }: { actor: MemberActor }) {
  const soc = getSociety(actor.societyId)!;
  const scope = { societyId: soc.id, memberId: actor.id };
  const card = listCards(scope)[0];
  const events = listEvents(soc.id, "open", actor.id);
  const onEvent = card?.event_id && card.event_status === "open" ? events.find((e) => e.id === card.event_id) : undefined;
  // listReviews is already limited to this member's own payments.
  const flags = listReviews(actor).filter((r) => ["pending", "receipt_requested"].includes(r.status));
  const txns = listTransactions({ ...scope, limit: 8 });

  return (
    <>
      <PageHeader
        eyebrow={`${soc.name} · ${ROLE_LABEL[actor.role] ?? actor.role}`}
        title={<>{greetingNow()}, {actor.name.split(" ")[0]}.</>}
        actions={<Link href="/expenses" className={button("secondary")}>Submit an expense</Link>}
      >
        {flags.length > 0 ? (
          <>
            <b className="font-semibold text-ink">
              {flags.length} of your purchase{flags.length === 1 ? " is" : "s are"}
            </b>{" "}
            waiting on your treasurer&rsquo;s review.
          </>
        ) : card ? (
          "Your card is ready. Paid out of pocket? Submit an expense and track the repayment."
        ) : (
          "You don't have a society card yet. Ask your treasurer to issue one."
        )}
      </PageHeader>

      {card?.status === "inactive" && (
        <div className="mb-6">
          <Notice tone="info" title="Your card is frozen">
            {card.status_reason === PLAN_LAPSED_REASON
              ? "The society's plan has ended. It works again as soon as your treasurer renews it."
              : `${card.status_reason ?? "Frozen by your treasurer"}. Your treasurer can unfreeze it.`}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          {card ? (
            <>
              <VirtualCard
                title={ROLE_LABEL[card.holder_role] ?? card.holder_role}
                art={roleArt(card.holder_role)}
                societyName={soc.name}
                holder={card.holder_name}
                last4={card.last4}
                expMonth={card.exp_month}
                expYear={card.exp_year}
                status={card.status}
                network={card.network}
                tag={onEvent ? `For ${onEvent.name}` : "General spending"}
              />
              <Panel className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-2">Card ending {card.last4}</span>
                  <CardStatusPill status={card.status} />
                </div>
                <div>
                  <MonthBar spent={card.month_spent} limit={card.monthly_limit_cents} />
                  <div className="mt-1 text-xs text-ink-3 tabular">Up to {fmtEur(card.per_auth_cap_cents)} per purchase</div>
                </div>
                {card.status === "active" && (
                  <Link href={`/simulator?card=${card.id}`} className={button("secondary", "w-full")}>
                    <CreditCard className="h-4 w-4" /> Simulate a purchase
                  </Link>
                )}
              </Panel>
            </>
          ) : (
            <Panel>
              <EmptyState title="No card yet" image="/art/persona-officer.webp">
                Your treasurer issues officer cards. Once you have one it shows up here.
              </EmptyState>
            </Panel>
          )}

          {card && (
            <Panel>
              <SectionTitle>Spending for</SectionTitle>
              {onEvent ? (
                <Link href={`/events/${onEvent.id}`} className="block">
                  <EventCover name={onEvent.name} type={onEvent.type} typeLabel={EVENT_TYPES.find((t) => t.value === onEvent.type)?.label ?? onEvent.type} />
                  <div className="mt-3 flex items-baseline justify-between text-sm">
                    <span className="text-ink-2">{fmtDate(onEvent.start_date)}</span>
                    <span className="tabular text-ink-2">
                      <b className="font-semibold text-ink">{fmtEur(onEvent.remaining)}</b> left on the budget
                    </span>
                  </div>
                  <div className="mt-2">
                    <BudgetBar budget={onEvent.budget_cents} spent={onEvent.spent} held={onEvent.held} showLegend={false} thin />
                  </div>
                </Link>
              ) : (
                <p className="text-sm text-ink-2">
                  General society spending. Your treasurer points your card at an event when you&rsquo;re buying for one.
                </p>
              )}
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          {flags.length > 0 && (
            <Panel>
              <SectionTitle aside={<Link href="/review" className="hover:text-ink">All →</Link>}>Awaiting review</SectionTitle>
              <ul className="space-y-3">
                {flags.slice(0, 3).map((f) => (
                  <li key={f.authorization_id}>
                    <Link href={`/transactions/${f.authorization_id}`} className="block rounded-xl border border-line p-3 hover:bg-paper-2/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink">{f.merchant_name}</span>
                        <span className="tabular font-medium">{fmtEur(f.amount_cents)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{f.reason}</p>
                      <p className="mt-1 text-xs text-ink-3">{f.status.replaceAll("_", " ")}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel pad={false}>
            <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">My recent purchases</h2>
              <Link href="/transactions" className="text-sm text-ink-3 hover:text-ink">
                All →
              </Link>
            </div>
            <TxnList rows={txns} empty="No purchases on your card yet." />
          </Panel>
        </div>
      </div>
    </>
  );
}
