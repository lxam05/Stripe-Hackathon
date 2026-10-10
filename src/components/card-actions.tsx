"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleStop, LoaderCircle, RefreshCw, Snowflake, Sun, CreditCard } from "lucide-react";
import { button, Notice } from "./ui";

export function CardActions({ cardId, eventId, cardStatus, eventStatus, canManage }: { cardId: string; eventId: string; cardStatus: string; eventStatus: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = (key: string, url: string, init: RequestInit, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    setError(null);
    start(async () => {
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      if (!res.ok) setError((await res.json()).error?.message ?? "That didn't work.");
      setBusy(null);
      router.refresh();
    });
  };
  const patch = (action: string) => call(action, `/api/cards/${cardId}`, { method: "PATCH", body: JSON.stringify({ action }) });
  const icon = (k: string, I: typeof Snowflake) => (pending && busy === k ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />);

  if (!canManage) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {cardStatus === "pending" && (
          <button className={button("primary")} disabled={pending} onClick={() => patch("retry")}>
            {icon("retry", RefreshCw)} Retry issuing
          </button>
        )}
        {eventStatus === "open" && cardStatus === "active" && (
          <button className={button("secondary")} disabled={pending} onClick={() => patch("freeze")}>
            {icon("freeze", Snowflake)} Freeze card
          </button>
        )}
        {eventStatus === "open" && cardStatus === "inactive" && (
          <button className={button("primary")} disabled={pending} onClick={() => patch("unfreeze")}>
            {icon("unfreeze", Sun)} Unfreeze
          </button>
        )}
        {eventStatus === "open" && cardStatus === "canceled" && (
          <button className={button("primary")} disabled={pending} onClick={() => call("replace", `/api/events/${eventId}/replace-card`, { method: "POST" })}>
            {icon("replace", CreditCard)} Issue replacement card
          </button>
        )}
        {eventStatus === "open" && (
          <button
            className={button("ghost")}
            disabled={pending}
            onClick={() => call("close", `/api/events/${eventId}/close`, { method: "POST" }, "Close this event? The card stops working and unspent budget returns to the society.")}
          >
            {icon("close", CircleStop)} Close event
          </button>
        )}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
