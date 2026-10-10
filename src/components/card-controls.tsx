"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, CreditCard, LoaderCircle, RefreshCw, SlidersHorizontal, Snowflake, Sun } from "lucide-react";
import { fmtEur, parseEuroToCents } from "@/lib/money";
import { defaultLimits, ROLE_LABEL } from "@/lib/roles";
import { Notice, button, cx, field, label } from "./ui";

type EventOpt = { id: string; name: string };

function useCardApi() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const call = (key: string, url: string, init: RequestInit, onOk?: () => void) => {
    setBusy(key);
    setError(null);
    start(async () => {
      const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
      if (!res.ok) setError((await res.json()).error?.message ?? "That didn't work.");
      else onOk?.();
      setBusy(null);
      router.refresh();
    });
  };
  const spin = (k: string) => pending && busy === k;
  return { call, pending, spin, error };
}

const euro = (cents: number) => String(cents / 100);

/** Treasurer controls under an officer card: event assignment, freeze, limits, cancel. */
export function CardControls({
  card,
  events,
  planActive,
}: {
  card: { id: string; status: string; event_id: string | null; event_status: string | null; per_auth_cap_cents: number; monthly_limit_cents: number; holder_name: string };
  events: EventOpt[];
  planActive: boolean;
}) {
  const { call, pending, spin, error } = useCardApi();
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState(euro(card.per_auth_cap_cents));
  const [monthly, setMonthly] = useState(euro(card.monthly_limit_cents));
  const patch = (key: string, body: object, onOk?: () => void) => call(key, `/api/cards/${card.id}`, { method: "PATCH", body: JSON.stringify(body) }, onOk);
  const icon = (k: string, I: typeof Snowflake) => (spin(k) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />);
  const current = card.event_id && card.event_status === "open" ? card.event_id : "";

  if (card.status === "pending") {
    return (
      <div className="space-y-2">
        <button className={button("primary")} disabled={pending} onClick={() => patch("retry", { action: "retry" })}>
          {icon("retry", RefreshCw)} Retry issuing
        </button>
        <button className={button("ghost")} disabled={pending} onClick={()=>patch("cancel",{action:"cancel"})}>Cancel pending card</button>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`assign-${card.id}`} className={label}>
          Spending for
        </label>
        <select
          id={`assign-${card.id}`}
          className={field}
          value={current}
          disabled={pending}
          onChange={(e) => patch("assign", { action: "assign", event_id: e.target.value || null })}
        >
          <option value="">General society spending</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {editing ? (
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch("limits", { action: "limits", per_auth_cap_cents: parseEuroToCents(cap), monthly_limit_cents: parseEuroToCents(monthly) }, () => setEditing(false));
          }}
        >
          <div>
            <label htmlFor={`cap-${card.id}`} className={label}>
              Purchase review threshold (€)
            </label>
            <input id={`cap-${card.id}`} inputMode="decimal" className={cx(field, "tabular")} value={cap} onChange={(e) => setCap(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`mon-${card.id}`} className={label}>
              Monthly review threshold (€)
            </label>
            <input id={`mon-${card.id}`} inputMode="decimal" className={cx(field, "tabular")} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className={button("ghost")} onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className={button("primary")} disabled={pending}>
              {spin("limits") && <LoaderCircle className="h-4 w-4 animate-spin" />} Save thresholds
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {card.status === "active" && (
            <button className={button("secondary")} disabled={pending} onClick={() => patch("freeze", { action: "freeze" })}>
              {icon("freeze", Snowflake)} Freeze
            </button>
          )}
          {card.status === "inactive" && planActive && (
            <button className={button("primary")} disabled={pending} onClick={() => patch("unfreeze", { action: "unfreeze" })}>
              {icon("unfreeze", Sun)} Unfreeze
            </button>
          )}
          <button className={button("ghost")} disabled={pending} onClick={() => setEditing(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Thresholds
          </button>
          <button
            className={button("ghost", "text-bad")}
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Cancel ${card.holder_name}'s card? It stops working immediately and frees the slot. You can issue a replacement.`))
                patch("cancel", { action: "cancel" });
            }}
          >
            {icon("cancel", Ban)} Cancel
          </button>
        </div>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

/** Empty slot: issue a card to an officer who doesn't have one yet. */
export function IssueCardForm({ members, events }: { members: { id: string; name: string; role: string }[]; events: EventOpt[] }) {
  const { call, pending, error } = useCardApi();
  const first = members[0];
  const [memberId, setMemberId] = useState(first?.id ?? "");
  const [cap, setCap] = useState(euro(defaultLimits(first?.role ?? "").perAuthCapCents));
  const [monthly, setMonthly] = useState(euro(defaultLimits(first?.role ?? "").monthlyLimitCents));
  const [eventId, setEventId] = useState("");

  if (!first) return <p className="text-sm text-ink-3">Every committee member already has a card.</p>;

  const pickMember = (id: string) => {
    setMemberId(id);
    const d = defaultLimits(members.find((m) => m.id === id)?.role ?? "");
    setCap(euro(d.perAuthCapCents));
    setMonthly(euro(d.monthlyLimitCents));
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        call("issue", "/api/cards", {
          method: "POST",
          body: JSON.stringify({ member_id: memberId, per_auth_cap_cents: parseEuroToCents(cap), monthly_limit_cents: parseEuroToCents(monthly), event_id: eventId || null }),
        });
      }}
    >
      <div>
        <label htmlFor="issue-member" className={label}>
          Cardholder
        </label>
        <select id="issue-member" className={field} value={memberId} onChange={(e) => pickMember(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {ROLE_LABEL[m.role] ?? m.role}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="issue-cap" className={label}>
            Purchase review threshold (€)
          </label>
          <input id="issue-cap" inputMode="decimal" className={cx(field, "tabular")} value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div>
          <label htmlFor="issue-monthly" className={label}>
            Monthly review threshold (€)
          </label>
          <input id="issue-monthly" inputMode="decimal" className={cx(field, "tabular")} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="issue-event" className={label}>
          Spending for
        </label>
        <select id="issue-event" className={field} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">General spending</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <button type="submit" className={button("primary", "w-full")} disabled={pending}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {pending ? "Issuing card…" : "Issue card"}
      </button>
    </form>
  );
}

export function ReplaceCardButton({ cardId, disabled }: { cardId: string; disabled?: boolean }) {
  const { call, pending, error } = useCardApi();
  return (
    <div className="space-y-2">
      <button className={button("secondary")} disabled={pending || disabled} onClick={() => call("replace", `/api/cards/${cardId}/replace`, { method: "POST" })}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Issue replacement
      </button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

/** Thin bar: this month's spend against the card's monthly limit. */
export function MonthBar({ spent, limit }: { spent: number; limit: number }) {
  const pct = Math.min(100, (spent / Math.max(1, limit)) * 100);
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-2" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={spent} aria-label="Spent this month">
        <div className={cx("h-full rounded-full", pct >= 90 ? "bg-warn" : "bg-ok")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-ink-3 tabular">
        {fmtEur(spent)} of {fmtEur(limit)} this month
      </div>
    </div>
  );
}
