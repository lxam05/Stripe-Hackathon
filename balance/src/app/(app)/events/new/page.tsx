import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { NewEventForm } from "@/components/new-event-form";
import { EmptyState, PageHeader, Panel, button } from "@/components/ui";
import { requireMember } from "@/lib/guard";
import { globalBlockedMccs } from "@/lib/policy";
import { mccInfo } from "@/lib/mcc";
import { getSociety, listMembers, societyOverview } from "@/lib/queries";
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
            Ask your treasurer to set up the event. You&rsquo;ll get the card as soon as it&rsquo;s issued.
          </EmptyState>
        </Panel>
      </>
    );
  }
  if (soc.plan_status !== "active") {
    return (
      <>
        <PageHeader eyebrow={soc.name} title="New event" actions={back} />
        <Panel>
          <EmptyState
            title="Card issuing is locked"
            image="/art/persona-treasurer.webp"
            action={
              <Link href="/plan" className={button("primary")}>
                <Lock className="h-4 w-4" /> Renew the Society Plan, €49/year
              </Link>
            }
          >
            Your 2025/26 plan has ended. Renew for the new academic year to issue event cards.
          </EmptyState>
        </Panel>
      </>
    );
  }
  const members = listMembers(soc.id).map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const o = societyOverview(soc.id);
  const today = new Date().toISOString().slice(0, 10);
  const blocked = globalBlockedMccs().map((c) => mccInfo(c).label);

  return (
    <>
      <PageHeader eyebrow={soc.name} title="New event" actions={back}>
        The card is issued the moment you save, with these limits built in.
      </PageHeader>
      <NewEventForm
        societyName={soc.name}
        members={members}
        unallocatedCents={o.unallocated}
        blockedLabels={blocked}
        defaults={{ start: addDays(today, 4), end: addDays(today, 4) }}
      />
    </>
  );
}
