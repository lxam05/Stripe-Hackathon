import Link from "next/link";
import { Simulator } from "@/components/simulator";
import { EmptyState, PageHeader, Panel, button } from "@/components/ui";
import { env, stripeEnabled } from "@/lib/env";
import { requireActor } from "@/lib/guard";
import { MCC_TABLE } from "@/lib/mcc";
import { activeCards } from "@/lib/queries";
import { eventRemaining } from "@/lib/ledger";
import { getDb } from "@/lib/db";
import { MERCHANT_PRESETS } from "@/lib/simulator";
import { dublinParts } from "@/lib/money";

export const metadata = { title: "Purchase simulator" };

export default async function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const cards = activeCards(actor.kind === "member" ? actor.societyId : undefined).map((c) => ({
    id: c.id,
    label: `${c.event_name} · ••${c.last4}`,
    society: c.society_name,
    holder: c.holder_name ?? "",
    status: c.status,
    eventType: c.event_type,
    cap: c.per_auth_cap_cents,
    remaining: eventRemaining(c.event_id, (getDb().prepare(`SELECT budget_cents FROM event WHERE id=?`).get(c.event_id) as { budget_cents: number }).budget_cents).remaining,
  }));
  const today = dublinParts(new Date().toISOString()).date;

  return (
    <>
      <PageHeader eyebrow="Demo tool" title="Purchase simulator">
        Fire a card authorisation as if a merchant charged an event card.{" "}
        {env.issuingMode === "stripe"
          ? "Stripe Issuing test helpers create a real sandbox authorisation; our webhook decides it."
          : "It runs through exactly the same decision engine the Stripe webhook uses (MockAdapter)."}
      </PageHeader>
      {cards.length === 0 ? (
        <Panel>
          <EmptyState title="No active cards" image="/art/persona-officer.webp" action={actor.kind === "member" && <Link href="/events/new" className={button("primary")}>Create an event</Link>}>
            Create an event to issue a card, then come back to make purchases with it.
          </EmptyState>
        </Panel>
      ) : (
        <Simulator
          cards={cards}
          initialCard={typeof sp.card === "string" ? sp.card : undefined}
          presets={MERCHANT_PRESETS.map((p) => ({ ...p }))}
          mccs={MCC_TABLE.map((m) => ({ code: m.code, label: m.label, policy: m.defaultPolicy }))}
          today={today}
          stripe={stripeEnabled() && env.issuingMode === "stripe"}
        />
      )}
    </>
  );
}
