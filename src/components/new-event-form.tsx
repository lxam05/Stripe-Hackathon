"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { CalendarRange, CalendarPlus, CreditCard, LoaderCircle, ShieldCheck, Ban } from "lucide-react";
import { EVENT_TYPES, type EventType } from "@/lib/mcc";
import { addDays, fmtDate, fmtEur, parseEuroToCents } from "@/lib/money";
import { ROLE_LABEL } from "@/lib/roles";
import { EventCover } from "./virtual-card";
import { Notice, Panel, button, cx, field, label } from "./ui";

interface CardOpt {
  id: string;
  holder_name: string;
  holder_role: string;
  last4: string;
  status: string;
  per_auth_cap_cents: number;
  /** Open event this card is currently spending for, if any. */
  current_event: string | null;
}

interface Props {
  cards: CardOpt[];
  unallocatedCents: number;
  blockedLabels: string[];
  defaults: { start: string; end: string };
}

export function NewEventForm({ cards, unallocatedCents, blockedLabels, defaults }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const officer = cards.find((c) => c.holder_role === "events_officer" && !c.current_event);
  const [f, setF] = useState({
    name: "",
    type: "social" as EventType,
    start: defaults.start,
    end: defaults.end,
    attendees: "80",
    budget: "300",
    cardIds: officer ? [officer.id] : ([] as string[]),
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const budgetCents = parseEuroToCents(f.budget);
  const chosen = cards.filter((c) => f.cardIds.includes(c.id));
  const toggleCard = (id: string) => set("cardIds", f.cardIds.includes(id) ? f.cardIds.filter((x) => x !== id) : [...f.cardIds, id]);

  const issues = useMemo(() => {
    const e: Record<string, string> = {};
    if (budgetCents == null || budgetCents < 100) e.budget = "Enter a budget of at least €1.";
    if (f.end < f.start) e.end = "The end date can't be before the start date.";
    return e;
  }, [budgetCents, f.end, f.start]);

  const overBudget = budgetCents != null && budgetCents > unallocatedCents;

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!f.name.trim()) return setError("Give the event a name.");
    if (Object.keys(issues).length) return setError(Object.values(issues)[0]);
    start(async () => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          type: f.type,
          start_date: f.start,
          end_date: f.end,
          expected_attendees: Number(f.attendees || 0),
          budget_cents: budgetCents,
          card_ids: f.cardIds,
          notes: f.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error?.message ?? "Couldn't create the event.");
      router.push(`/events/${j.event_id}?created=1`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.2fr_1fr]" noValidate>
      <Panel className="space-y-5">
        <div>
          <label htmlFor="name" className={label}>
            Event name
          </label>
          <input id="name" className={field} placeholder="Pizza Night" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} autoFocus />
        </div>
        <fieldset>
          <legend className={label}>Type</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => set("type", t.value)}
                aria-pressed={f.type === t.value}
                className={cx("rounded-full border px-3.5 py-1.5 text-sm transition", f.type === t.value ? "border-stone bg-stone text-white" : "border-line-strong bg-white text-ink-2 hover:bg-paper-2")}
              >
                {t.label}
              </button>
            ))}
          </div>
          {f.type === "trip" && <p className="mt-1.5 text-xs text-ink-3">Trips pre-approve airlines and hotels, and foreign merchants aren&rsquo;t flagged.</p>}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="start" className={label}>
              Starts
            </label>
            <input id="start" type="date" className={field} value={f.start} onChange={(e) => setF((p) => ({ ...p, start: e.target.value, end: p.end < e.target.value ? e.target.value : p.end }))} />
          </div>
          <div>
            <label htmlFor="end" className={label}>
              Ends
            </label>
            <input id="end" type="date" className={cx(field, issues.end && "border-bad")} value={f.end} min={f.start} onChange={(e) => set("end", e.target.value)} aria-invalid={!!issues.end} />
            {issues.end && <p className="mt-1 text-xs text-bad">{issues.end}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="budget" className={label}>
              Budget (€)
            </label>
            <input id="budget" inputMode="decimal" className={cx(field, "tabular", issues.budget && "border-bad")} value={f.budget} onChange={(e) => set("budget", e.target.value)} aria-invalid={!!issues.budget} />
          </div>
          <div>
            <label htmlFor="att" className={label}>
              Attendees
            </label>
            <input id="att" inputMode="numeric" className={cx(field, "tabular")} value={f.attendees} onChange={(e) => set("attendees", e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        {issues.budget && <p className="-mt-3 text-xs text-bad">{issues.budget}</p>}
        {overBudget && (
          <Notice tone="warn" title="More than your unallocated money">
            {fmtEur(Math.max(0, unallocatedCents))} is unallocated. You can still create the event, but purchases are declined once the society runs out. Share your sponsor link to top up.
          </Notice>
        )}
        <fieldset>
          <legend className={label}>Officer cards that spend for this event</legend>
          {cards.length === 0 ? (
            <p className="text-sm text-ink-3">No officer cards yet. Issue them on the Officer cards page, then switch one on for this event.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cards.map((c) => {
                const on = f.cardIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cx(
                      "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition",
                      on ? "border-stone bg-paper-2" : "border-line-strong bg-white hover:bg-paper-2/60",
                    )}
                  >
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--stone)]" checked={on} onChange={() => toggleCard(c.id)} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {c.holder_name} <span className="font-normal tabular text-ink-3">••{c.last4}</span>
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {ROLE_LABEL[c.holder_role] ?? c.holder_role}
                        {c.status === "inactive" ? " · frozen" : ""}
                        {c.current_event ? ` · moves from ${c.current_event}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div>
          <label htmlFor="notes" className={label}>
            What&rsquo;s it for? <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <textarea id="notes" rows={2} className={field} placeholder="e.g. Pizza + soft drinks for freshers, room booked in the Student Centre" value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          <p className="mt-1 text-xs text-ink-3">Helps spot purchases that don&rsquo;t fit the event.</p>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end">
          <button type="submit" className={button("primary", "px-5")} disabled={pending}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {pending ? "Creating…" : "Create event"}
          </button>
        </div>
      </Panel>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <EventCover name={f.name || "Your event"} type={f.type} typeLabel={EVENT_TYPES.find((t) => t.value === f.type)?.label ?? f.type} size="md" />
        <Panel>
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">Checked on every purchase</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>
                <b className="font-medium">{budgetCents != null ? fmtEur(budgetCents) : "—"}</b> event budget, shared by the cards on it
              </span>
            </li>
            <li className="flex gap-3">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>
                {chosen.length === 0
                  ? "No card yet. You can switch one on later."
                  : chosen.map((c) => `${c.holder_name.split(" ")[0]} (review above ${fmtEur(c.per_auth_cap_cents)})`).join(", ")}
                <span className="block text-xs text-ink-3">Each card keeps its own hard spending limits. Event budgets and dates are advisory.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
              <span>
                Works {fmtDate(addDays(f.start, -14))} → {fmtDate(addDays(f.end || f.start, 3))}
                <span className="block text-xs text-ink-3">14 days before, 3 days after (for late receipts)</span>
              </span>
            </li>
            <li className="flex gap-3">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
              <span>
                Blocked UCD-wide: <span className="text-ink-2">{blockedLabels.join(", ")}</span>
              </span>
            </li>
          </ul>
        </Panel>
      </div>
    </form>
  );
}
