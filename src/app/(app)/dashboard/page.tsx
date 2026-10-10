import Link from "next/link";
import { requireMember } from "@/lib/guard";
import type { MemberActor } from "@/lib/session";
import { isFinance, isTreasurer, reportOwner } from "@/lib/access";
import { listExpenses, listReviews, listReports } from "@/lib/workflows";
import { getSociety, listCards, listEvents, listTransactions, monthlySpend } from "@/lib/queries";
import { societyBalances } from "@/lib/ledger";
import { PLAN_LAPSED_REASON } from "@/lib/cards";
import { ChevronRight, CreditCard, FileText, Receipt, ShieldAlert } from "lucide-react";
import { MonthBar } from "@/components/card-controls";
import { VirtualCard, roleArt } from "@/components/virtual-card";
import { EmptyState, PageHeader, Panel, SectionTitle, StatTile, Notice, button } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/roles";
import { SpendChart } from "@/components/spend-chart";
import { TxnList, prettyMerchant } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { plainText } from "@/lib/explain";
import { dublinParts, fmtEur } from "@/lib/money";
export const metadata = { title: "Overview" };

const greetingNow = () => {
  const hour = dublinParts(new Date().toISOString()).hour;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

type Todo = { href: string; icon: typeof Receipt; title: string; detail: string; amount?: number };

/** Treasurer and senior treasurer see the society; every other member gets their own card and spending only. */
export default async function Dashboard() {
  const a = await requireMember();
  if (!isFinance(a)) return <OfficerHome actor={a} />;
  const s = getSociety(a.societyId)!;
  const b = societyBalances(s.id);
  const reviews = listReviews(a).filter((r) => ["pending", "receipt_requested"].includes(r.status));
  const claims = listExpenses(a).filter((e) => ["submitted", "approved"].includes(e.status));
  const owesMembers = claims.reduce((sum, e) => sum + e.amount_cents, 0);
  const spend = monthlySpend(s.id);
  const report = listReports(a)[0];
  const ownsReport = reportOwner(s.id)?.id === a.id;

  // One list of everything waiting on someone, instead of a card per area.
  const todos: Todo[] = [
    ...reviews.map((r) => ({
      href: `/transactions/${r.authorization_id}`,
      icon: ShieldAlert,
      title: `${prettyMerchant(r.merchant_name)}`,
      detail: `${r.member_name.split(" ")[0]} · ${r.status === "receipt_requested" ? "receipt requested" : plainText(r.reason) || "first payment to this shop"}`,
      amount: r.amount_cents,
    })),
    ...claims.map((e) => ({
      href: "/expenses",
      icon: Receipt,
      title: `Repay ${e.member_name.split(" ")[0]}`,
      detail: `${e.merchant} · ${e.status === "approved" ? "approved, not yet paid" : "expense to approve"}`,
      amount: e.amount_cents,
    })),
    ...(ownsReport && (!report || report.status === "draft")
      ? [{ href: "/reports", icon: FileText, title: "Annual grant report", detail: report ? "Draft in progress" : "Ready to start" }]
      : []),
  ];

  return (
    <>
      <AutoRefresh active ms={10000} />
      <PageHeader
        eyebrow={s.name}
        title={`${greetingNow()}, ${a.name.split(" ")[0]}.`}
        actions={
          isTreasurer(a) ? (
            <Link href="/cards" className={button("secondary")}>
              <CreditCard className="h-4 w-4" /> Cards
            </Link>
          ) : undefined
        }
      >
        {todos.length
          ? [
              reviews.length && `${reviews.length} payment${reviews.length === 1 ? "" : "s"} to review`,
              claims.length && `${claims.length} expense${claims.length === 1 ? "" : "s"} to repay`,
            ]
              .filter(Boolean)
              .join(" and ") + "." || "Your grant report is ready to work on."
          : "Everything is up to date."}
      </PageHeader>
      {s.plan_status !== "active" && (
        <div className="mb-6">
          <Notice tone="warn" title="Committee cards are paused">
            <Link className="underline" href="/plan">
              Renew the €49/year Society Plan
            </Link>{" "}
            to switch them back on.
          </Notice>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Available to spend" cents={b.available} />
        <StatTile label="Spent so far" cents={b.spent} tone="spent" />
        <StatTile label="Owed to members" cents={owesMembers} hint={claims.length ? `${claims.length} expense${claims.length === 1 ? "" : "s"}` : "Nothing outstanding"} />
      </div>

      <Panel className="mt-6">
        <SectionTitle aside={spend.length ? `${fmtEur(spend.reduce((t, m) => t + m.cents, 0))} since September` : undefined}>Monthly spending</SectionTitle>
        <SpendChart data={spend} />
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel pad={false}>
          <div className="px-5 pb-2 pt-5">
            <SectionTitle aside={reviews.length ? <Link href="/review">All reviews →</Link> : undefined}>Needs attention</SectionTitle>
          </div>
          {todos.length ? (
            <ul className="divide-y divide-line">
              {todos.slice(0, 6).map((t, i) => (
                <li key={i}>
                  <Link href={t.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-paper-2/60">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral/15 text-[#a8452c]">
                      <t.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{t.title}</div>
                      <div className="truncate text-xs text-ink-3">{t.detail}</div>
                    </div>
                    {t.amount != null && <span className="tabular font-medium">{fmtEur(t.amount)}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-8 pt-4 text-sm text-ink-2">Nothing to review. New payments that look unusual will show up here.</p>
          )}
        </Panel>
        <Panel pad={false}>
          <div className="px-5 pb-2 pt-5">
            <SectionTitle aside={<Link href="/transactions">All →</Link>}>Recent card payments</SectionTitle>
          </div>
          <TxnList rows={listTransactions({ societyId: s.id, limit: 6 })} />
        </Panel>
      </div>
    </>
  );
}

/**
 * An officer's overview: their own card and this month's spend, plus their own purchases.
 * No society balances, funding or other officers.
 */
function OfficerHome({ actor }: { actor: MemberActor }) {
  const soc = getSociety(actor.societyId)!;
  const scope = { societyId: soc.id, memberId: actor.id };
  const card = listCards(scope)[0];
  const events = listEvents(soc.id, "open", actor.id);
  const onEvent = card?.event_id && card.event_status === "open" ? events.find((e) => e.id === card.event_id) : undefined;
  // listReviews is already limited to this member's own payments.
  const flags = listReviews(actor).filter((r) => ["pending", "receipt_requested"].includes(r.status));

  return (
    <>
      <PageHeader
        eyebrow={`${soc.name} · ${ROLE_LABEL[actor.role] ?? actor.role}`}
        title={<>{greetingNow()}, {actor.name.split(" ")[0]}.</>}
        actions={<Link href="/expenses" className={button("secondary")}>Claim an expense</Link>}
      >
        {flags.length > 0
          ? `${flags.length} of your purchase${flags.length === 1 ? " is" : "s are"} waiting on your treasurer. Nothing for you to do.`
          : card
            ? "Your card is ready to use."
            : "You don't have a society card yet. Ask your treasurer to issue one."}
      </PageHeader>

      {card?.status === "inactive" && (
        <div className="mb-6">
          <Notice tone="info" title="Your card is frozen">
            {card.status_reason === PLAN_LAPSED_REASON
              ? "The society's plan has ended. It works again as soon as your treasurer renews it."
              : "Your treasurer has paused it. Ask them to unfreeze it."}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          {card ? (
            <>
              <Link href="/cards" aria-label="Open my card">
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
              </Link>
              <Panel>
                <MonthBar spent={card.month_spent} limit={card.monthly_limit_cents} />
              </Panel>
            </>
          ) : (
            <Panel>
              <EmptyState title="No card yet" image="/art/persona-officer.webp">
                Your treasurer issues officer cards. Once you have one it shows up here.
              </EmptyState>
            </Panel>
          )}
        </div>

        <Panel pad={false} className="min-w-0 self-start">
          <div className="px-5 pb-2 pt-5">
            <SectionTitle aside={<Link href="/transactions">All →</Link>}>My recent purchases</SectionTitle>
          </div>
          <TxnList rows={listTransactions({ ...scope, limit: 8 })} empty="No purchases on your card yet." />
        </Panel>
      </div>
    </>
  );
}
