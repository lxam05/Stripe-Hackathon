"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleStop, LoaderCircle } from "lucide-react";
import { ROLE_LABEL } from "@/lib/roles";
import { CardStatusPill, Notice, button, cx } from "./ui";

interface CardOpt {
  id: string;
  holder_name: string;
  holder_role: string;
  last4: string;
  status: string;
  event_id: string | null;
  event_name: string | null;
  event_status: string | null;
}

/** Which officer cards spend for this event. Treasurers toggle them here. */
export function EventCards({ eventId, cards, editable }: { eventId: string; cards: CardOpt[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assign = (card: CardOpt, on: boolean) => {
    const elsewhere = card.event_id && card.event_id !== eventId && card.event_status === "open";
    if (on && elsewhere && !window.confirm(`${card.holder_name}'s card is spending for ${card.event_name}. Move it to this event?`)) return;
    setBusy(card.id);
    setError(null);
    start(async () => {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", event_id: on ? eventId : null }),
      });
      if (!res.ok) setError((await res.json()).error?.message ?? "That didn't work.");
      setBusy(null);
      router.refresh();
    });
  };

  const shown = editable ? cards : cards.filter((c) => c.event_id === eventId);
  if (!shown.length) return <p className="text-sm text-ink-3">No officer card is spending for this event yet.</p>;

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {shown.map((c) => {
          const on = c.event_id === eventId;
          const elsewhere = !on && c.event_id && c.event_status === "open" ? c.event_name : null;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium text-ink">
                  {c.holder_name} <span className="font-normal tabular text-ink-3">••{c.last4}</span>
                </div>
                <div className="truncate text-xs text-ink-3">
                  {ROLE_LABEL[c.holder_role] ?? c.holder_role}
                  {elsewhere ? ` · on ${elsewhere}` : !on ? " · general spending" : ""}
                </div>
              </div>
              {editable ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${c.holder_name}'s card spends for this event`}
                  disabled={pending}
                  onClick={() => assign(c, !on)}
                  className={cx(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
                    on ? "bg-stone" : "bg-line-strong",
                    pending && busy === c.id && "opacity-60",
                  )}
                >
                  <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", on ? "translate-x-5" : "translate-x-0.5")} />
                </button>
              ) : (
                <CardStatusPill status={c.status} />
              )}
            </li>
          );
        })}
      </ul>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

export function CloseEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className={button("ghost")}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Close this event? Its cards go back to general spending and the unspent budget returns to the society.")) return;
          setError(null);
          start(async () => {
            const res = await fetch(`/api/events/${eventId}/close`, { method: "POST" });
            if (!res.ok) setError((await res.json()).error?.message ?? "That didn't work.");
            router.refresh();
          });
        }}
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleStop className="h-4 w-4" />} Close event
      </button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
