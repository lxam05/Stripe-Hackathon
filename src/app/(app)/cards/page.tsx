import Link from "next/link";
import { CreditCard, Lock, Plus } from "lucide-react";
import { CardControls, IssueCardForm, MonthBar, ReplaceCardButton } from "@/components/card-controls";
import { CardStatusPill, Notice, PageHeader, Panel, SectionTitle, button } from "@/components/ui";
import { VirtualCard, roleArt } from "@/components/virtual-card";
import { requireMember } from "@/lib/guard";
import { fmtDate, fmtEur } from "@/lib/money";
import { getSociety, listCards, listEvents, listMembers } from "@/lib/queries";
import { CARDS_PER_SOCIETY, ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Cards" };

export default async function CardsPage() {
  const actor = await requireMember();
  const soc = getSociety(actor.societyId)!;
  const isTreasurer = actor.role === "treasurer";
  const planActive = soc.plan_status === "active";
  // Officers only ever see their own card; the other four belong to other people.
  const all = listCards({ societyId: soc.id, memberId: isTreasurer ? undefined : actor.id, includeCanceled: true });
  const live = all.filter((c) => c.status !== "canceled");
  const members = listMembers(soc.id);
  const withoutCard = members.filter((m) => !live.some((c) => c.member_id === m.id)).map((m) => ({ id: m.id, name: m.name, role: m.role }));
  // Cancelled cards whose officer hasn't been given a new one yet.
  const replaceable = all.filter((c) => c.status === "canceled" && withoutCard.some((m) => m.id === c.member_id)).filter((c, i, xs) => xs.findIndex((x) => x.member_id === c.member_id) === i);
  const events = listEvents(soc.id, "open").map((e) => ({ id: e.id, name: e.name }));
  const free = isTreasurer ? Math.max(0, CARDS_PER_SOCIETY - live.length) : 0;
  const canIssue = isTreasurer && planActive;

  return (
    <>
      <PageHeader
        eyebrow={soc.name}
        title={isTreasurer ? "Officer cards" : "My card"}
        actions={
          <Link href="/events" className={button("secondary")}>
            {isTreasurer ? "Events" : "My events"}
          </Link>
        }
      >
        {isTreasurer ? (
          <>
            Your Society Plan includes {CARDS_PER_SOCIETY} virtual cards, one per committee officer. Point a card at an event and its purchases come out of
            that event&rsquo;s budget. Otherwise it spends from unallocated money. Every card has its own per-purchase and monthly limit.
          </>
        ) : (
          <>Your society card. Your treasurer sets its limits and which event it spends for.</>
        )}
      </PageHeader>

      {!planActive && (
        <div className="mb-6">
          {isTreasurer ? (
            <Notice tone="warn" title={`Your Society Plan ended on ${fmtDate(soc.plan_renews_at ?? "2026-09-30")}`}>
              Every card is frozen until you renew.{" "}
              <Link href="/plan" className="font-medium underline">
                Renew for €49/year
              </Link>{" "}
              and they work again straight away.
            </Notice>
          ) : (
            <Notice tone="warn" title="Your card is frozen">
              The society&rsquo;s plan has ended. It works again as soon as your treasurer renews it.
            </Notice>
          )}
        </div>
      )}

      {isTreasurer && <SectionTitle aside={`${live.length} of ${CARDS_PER_SOCIETY} issued`}>Cards</SectionTitle>}
      {!isTreasurer && live.length === 0 && (
        <Panel className="mb-10">
          <p className="text-sm text-ink-2">You don&rsquo;t have a card yet. Ask your treasurer to issue one.</p>
        </Panel>
      )}
      <div className="mb-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {live.map((c) => {
          const onEvent = c.event_id && c.event_status === "open";
          return (
            <Panel key={c.id} className="flex flex-col gap-4">
              <VirtualCard
                title={ROLE_LABEL[c.holder_role] ?? c.holder_role}
                art={roleArt(c.holder_role)}
                societyName={soc.name}
                holder={c.holder_name}
                last4={c.last4}
                expMonth={c.exp_month}
                expYear={c.exp_year}
                status={c.status}
                network={c.network}
                tag={onEvent ? `For ${c.event_name}` : "General spending"}
              />
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-ink">{c.holder_name}</span>
                <CardStatusPill status={c.status} />
              </div>
              {c.status === "inactive" && c.status_reason && <p className="-mt-2 text-xs text-ink-3">{c.status_reason}</p>}
              {c.status === "pending" && c.error && <Notice tone="warn">{c.error}</Notice>}
              <div>
                <MonthBar spent={c.month_spent} limit={c.monthly_limit_cents} />
                <div className="mt-1 text-xs text-ink-3 tabular">Up to {fmtEur(c.per_auth_cap_cents)} per purchase</div>
              </div>
              {onEvent && (
                <Link href={`/events/${c.event_id}`} className="-mt-1 text-sm text-ink-2 hover:text-ink">
                  Spending for <b className="font-medium text-ink">{c.event_name}</b> →
                </Link>
              )}
              {isTreasurer && (
                <div className="mt-auto border-t border-line pt-4">
                  <CardControls card={c} events={events} planActive={planActive} />
                </div>
              )}
              {!isTreasurer && c.status === "active" && c.member_id === actor.id && (
                <Link href={`/simulator?card=${c.id}`} className={button("secondary", "mt-auto")}>
                  <CreditCard className="h-4 w-4" /> Simulate a purchase
                </Link>
              )}
            </Panel>
          );
        })}

        {Array.from({ length: free }, (_, i) => (
          <div key={`free-${i}`} className="flex flex-col gap-4 rounded-2xl border border-dashed border-line-strong bg-surface/50 p-5">
            <div className="flex aspect-[1.586] w-full max-w-[380px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong text-ink-3">
              {canIssue ? <Plus className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              <span className="text-sm">Card slot {live.length + i + 1} of {CARDS_PER_SOCIETY}</span>
            </div>
            {i === 0 &&
              (canIssue ? (
                <IssueCardForm members={withoutCard} events={events} />
              ) : (
                <p className="text-sm text-ink-3">
                  {!planActive ? "Renew the Society Plan to issue cards." : "Your treasurer can issue this card to an officer."}
                </p>
              ))}
          </div>
        ))}
      </div>

      {isTreasurer && replaceable.length > 0 && (
        <>
          <SectionTitle>Cancelled</SectionTitle>
          <Panel pad={false} className="mb-10">
            <ul className="divide-y divide-line">
              {replaceable.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium text-ink">
                      {c.holder_name} · {ROLE_LABEL[c.holder_role] ?? c.holder_role} <span className="tabular text-ink-3">••{c.last4}</span>
                    </div>
                    <div className="text-ink-3">{c.status_reason ?? "Cancelled"}</div>
                  </div>
                  {isTreasurer && <ReplaceCardButton cardId={c.id} disabled={!planActive || free === 0} />}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}
