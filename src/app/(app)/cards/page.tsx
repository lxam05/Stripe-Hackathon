import type { ReactNode } from "react";
import Link from "next/link";
import { cardCapacity, syncSocietyCardsFromStripe } from "@/lib/cards";
import { CreditCard, Lock, Plus } from "lucide-react";
import { CardControls, IssueCardForm, MonthBar, ReplaceCardButton } from "@/components/card-controls";
import { CardStatusPill, Notice, PageHeader, Panel, SectionTitle, button } from "@/components/ui";
import { CardDialog } from "@/components/card-dialog";
import { VirtualCard, roleArt } from "@/components/virtual-card";
import { requireMember } from "@/lib/guard";
import { isFinance } from "@/lib/access";
import { fmtDate, fmtEur } from "@/lib/money";
import { getSociety, listCards, listEvents, listMembers } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { CARD_RESTRICTION_PROFILES } from "@/lib/card-restrictions";

export const metadata = { title: "Cards" };

export default async function CardsPage() {
  const actor = await requireMember();
  const soc = getSociety(actor.societyId)!;
  let stripeSyncError: string | null = null;
  try {
    await syncSocietyCardsFromStripe(soc.id);
  } catch (error) {
    stripeSyncError = error instanceof Error ? error.message : "Stripe Issuing could not be reached.";
  }
  const CARDS_PER_SOCIETY = cardCapacity(soc.id);
  const isTreasurer = actor.role === "treasurer";
  // Treasurer and senior treasurer see every card; anyone else only their own.
  const seesAll = isFinance(actor);
  const planActive = soc.plan_status === "active";
  // Officers only ever see their own card; the other four belong to other people.
  const all = listCards({ societyId: soc.id, memberId: seesAll ? undefined : actor.id, includeCanceled: true });
  const live = all.filter((c) => c.status !== "canceled");
  const members = listMembers(soc.id);
  const withoutCard = members
    .filter((m) => !["member", "senior_treasurer"].includes(m.role) && !m.name.includes("(demo)"))
    .filter((m) => !live.some((c) => c.member_id === m.id))
    .map((m) => ({ id: m.id, name: m.name, role: m.role }));
  // Cancelled cards whose officer hasn't been given a new one yet.
  const replaceable = all.filter((c) => c.status === "canceled" && withoutCard.some((m) => m.id === c.member_id)).filter((c, i, xs) => xs.findIndex((x) => x.member_id === c.member_id) === i);
  const events = listEvents(soc.id, "open").map((e) => ({ id: e.id, name: e.name }));
  const free = isTreasurer ? Math.max(0, CARDS_PER_SOCIETY - live.length) : 0;
  const canIssue = isTreasurer && planActive;

  return (
    <>
      <PageHeader
        eyebrow={soc.name}
        title={seesAll ? "Officer cards" : "My card"}
        actions={
          <Link href="/events" className={button("secondary")}>
            {seesAll ? "Events" : "My events"}
          </Link>
        }
      >
        {seesAll ? "Tap a card to see its details" + (isTreasurer ? ", change its limits or freeze it." : ".") : "Tap your card to see its details."}
      </PageHeader>

      {!planActive && (
        <div className="mb-6">
          {seesAll ? (
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

      {stripeSyncError && (
        <div className="mb-6">
          <Notice tone="bad" title="Stripe Issuing is unavailable">
            {stripeSyncError} No local or demo cards are substituted.
          </Notice>
        </div>
      )}

      {seesAll && <SectionTitle aside={`${live.length} of ${CARDS_PER_SOCIETY} slots used`}>Cards</SectionTitle>}
      {!seesAll && live.length === 0 && (
        <Panel className="mb-10">
          <p className="text-sm text-ink-2">You don&rsquo;t have a card yet. Ask your treasurer to issue one.</p>
        </Panel>
      )}
      <div className="mb-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {live.map((c) => {
          const onEvent = c.event_id && c.event_status === "open";
          const role = ROLE_LABEL[c.holder_role] ?? c.holder_role;
          const face = (
            <VirtualCard
              title={role}
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
          );
          return (
            <div key={c.id} className="max-w-[380px] space-y-2.5">
              <CardDialog trigger={face} label={`Open ${c.holder_name}'s card`} title={<>{c.holder_name}<span className="block text-base text-ink-3">{role} · ••{c.last4}</span></>}>
                <div className="space-y-5">
                  <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                    <Row label="Status">
                      <CardStatusPill status={c.status} />
                    </Row>
                    {c.status === "inactive" && c.status_reason && <Row label="Why">{c.status_reason}</Row>}
                    <Row label="Spending for">
                      {onEvent ? (
                        <Link href={`/events/${c.event_id}`} className="font-medium underline decoration-line underline-offset-4">
                          {c.event_name}
                        </Link>
                      ) : (
                        "General society spending"
                      )}
                    </Row>
                    <Row label="Maximum purchase">{fmtEur(c.per_auth_cap_cents)}</Row>
                    <Row label="Monthly limit">{fmtEur(c.monthly_limit_cents)}</Row>
                    <Row label="Merchant profile">{CARD_RESTRICTION_PROFILES[c.restriction_profile].label}</Row>
                  </dl>
                  <MonthBar spent={c.month_spent} limit={c.monthly_limit_cents} />
                  {c.status === "pending" && c.error && <Notice tone="warn">{c.error}</Notice>}
                  {isTreasurer && (
                    <div className="border-t border-line pt-4">
                      <CardControls card={c} events={events} planActive={planActive} />
                    </div>
                  )}
                  {c.status === "active" && (
                    <Link href={`/shop?card=${c.id}`} className={button("secondary", "w-full")}>
                      <CreditCard className="h-4 w-4" /> Try this card
                    </Link>
                  )}
                </div>
              </CardDialog>
              <div className="px-1">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-ink">{seesAll ? c.holder_name : "This month"}</span>
                  {c.status !== "active" && <CardStatusPill status={c.status} />}
                </div>
                <MonthBar spent={c.month_spent} limit={c.monthly_limit_cents} />
              </div>
            </div>
          );
        })}

        {Array.from({ length: free }, (_, i) => {
          const slot = (
            <div className="flex aspect-[1.586] w-full max-w-[380px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong bg-surface/50 text-ink-3">
              {canIssue ? <Plus className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              <span className="text-sm">{canIssue ? "Issue a card" : `Free slot ${live.length + i + 1} of ${CARDS_PER_SOCIETY}`}</span>
            </div>
          );
          return (
            <div key={`free-${i}`} className="max-w-[380px]">
              {canIssue ? (
                <CardDialog trigger={slot} label="Issue a new card" title="Issue a card">
                  <IssueCardForm members={withoutCard} events={events} />
                </CardDialog>
              ) : (
                slot
              )}
              {i === 0 && !canIssue && (
                <p className="mt-2 px-1 text-xs text-ink-3">{!planActive ? "Renew the Society Plan to issue cards." : "Your treasurer issues cards."}</p>
              )}
            </div>
          );
        })}
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}
