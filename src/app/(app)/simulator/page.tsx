import Link from "next/link";
import { Simulator } from "@/components/simulator";
import { EmptyState, PageHeader, Panel, button } from "@/components/ui";
import { env, stripeEnabled } from "@/lib/env";
import { requireActor } from "@/lib/guard";
import { MCC_TABLE } from "@/lib/mcc";
import { simulatorCards } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { MERCHANT_PRESETS } from "@/lib/simulator";
import { dublinParts } from "@/lib/money";

export const metadata = { title: "Purchase simulator" };

export default async function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const cards = simulatorCards(actor.kind === "member" ? actor.societyId : undefined).map((c) => {
    const onEvent = Boolean(c.event_id && c.event_status === "open");
    return {
      id: c.id,
      label: `${c.holder_name} (${ROLE_LABEL[c.holder_role] ?? c.holder_role}) · ••${c.last4}`,
      society: c.society_name,
      holder: c.holder_name,
      status: c.status,
      eventName: onEvent ? c.event_name : null,
      eventType: onEvent ? c.event_type : null,
      cap: c.per_auth_cap_cents,
      remaining: c.remaining,
      monthLeft: c.monthly_limit_cents - c.month_spent,
    };
  });
  const today = dublinParts(new Date().toISOString()).date;

  return (
    <>
      <PageHeader eyebrow="Demo tool" title="Purchase simulator">
        Fire a card authorisation as if a merchant charged an officer card.{" "}
        {env.issuingMode === "stripe"
          ? "Stripe Issuing test helpers create a real sandbox authorisation; our webhook decides it."
          : "It runs through exactly the same decision engine the Stripe webhook uses (MockAdapter)."}
      </PageHeader>
      {cards.length === 0 ? (
        <Panel>
          <EmptyState title="No active cards" image="/art/persona-officer.webp" action={actor.kind === "member" && <Link href="/cards" className={button("primary")}>Officer cards</Link>}>
            Issue an officer card (or renew the Society Plan to unfreeze yours), then come back to make purchases with it.
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
