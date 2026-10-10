import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewEventForm } from "@/components/new-event-form";
import { EmptyState, Notice, PageHeader, Panel, button } from "@/components/ui";
import { requireMember } from "@/lib/guard";
import { globalBlockedMccs } from "@/lib/policy";
import { mccInfo } from "@/lib/mcc";
import { getSociety, listCards, societyOverview } from "@/lib/queries";
import { addDays } from "@/lib/money";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const actor = await requireMember();
  const soc = getSociety(actor.societyId)!;
  const back = (
    <Link href="/events" className={button("ghost")}>
      <ArrowLeft className="h-4 w-4" /> Events
    </Link>
  );
  if (actor.role !== "treasurer") {
    return (
      <>
        <PageHeader eyebrow={soc.name} title="New event" actions={back} />
        <Panel>
          <EmptyState title="Only the treasurer can create events" image="/art/persona-treasurer.webp">
            Ask your treasurer to set up the event and switch your card on for it.
          </EmptyState>
        </Panel>
      </>
    );
  }
  const cards = listCards({ societyId: soc.id, usable: true }).map((c) => ({
    id: c.id,
    holder_name: c.holder_name,
    holder_role: c.holder_role,
    last4: c.last4,
    status: c.status,
    per_auth_cap_cents: c.per_auth_cap_cents,
    current_event: c.event_id && c.event_status === "open" ? c.event_name : null,
  }));
  const o = societyOverview(soc.id);
  const today = new Date().toISOString().slice(0, 10);
  const blocked = globalBlockedMccs().map((c) => mccInfo(c).label);

  return (
    <>
      <PageHeader eyebrow={soc.name} title="New event" actions={back}>
        An event is a budget with dates. Pick which officer cards spend for it.
      </PageHeader>
      {soc.plan_status !== "active" && (
        <div className="mb-6">
          <Notice tone="warn" title="Your officer cards are frozen">
            The Society Plan has ended, so no card can spend until you{" "}
            <Link href="/plan" className="font-medium underline">
              renew it
            </Link>
            . You can still plan events.
          </Notice>
        </div>
      )}
      <NewEventForm
        cards={cards}
        unallocatedCents={o.unallocated}
        blockedLabels={blocked}
        defaults={{ start: addDays(today, 4), end: addDays(today, 4) }}
      />
    </>
  );
}
