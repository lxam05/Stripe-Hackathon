"use client";

import { useState, useTransition } from "react";
import { Lock, LoaderCircle } from "lucide-react";
import { fmtEur, parseEuroToCents } from "@/lib/money";
import { cx, field, label, Notice } from "./ui";

const PRESETS = [5000, 10000, 25000, 50000];
const MIN = 500;
const MAX = 1_000_000;

export function TopUpForm({ slug, societyName, simulated }: { slug: string; societyName: string; simulated: boolean }) {
  const [preset, setPreset] = useState<number | null>(25000);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pub, setPub] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cents = preset ?? parseEuroToCents(custom);
  const amountError =
    preset == null && custom
      ? cents == null
        ? "Enter an amount like 75 or 75.50."
        : cents < MIN
          ? `The minimum is ${fmtEur(MIN)}.`
          : cents > MAX
            ? `The maximum is ${fmtEur(MAX)}.`
            : null
      : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (cents == null) return setError("Choose or enter an amount.");
    if (amountError) return setError(amountError);
    if (!name.trim()) return setError("Tell the society who this is from.");
    start(async () => {
      const res = await fetch("/api/topups/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ society_slug: slug, amount_cents: cents, payer_name: name, message, show_publicly: pub }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error?.message ?? "Couldn't start checkout.");
      window.location.href = j.url;
    });
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow-lift)] sm:p-7" noValidate>
      <h2 className="display text-3xl">Top up their budget</h2>
      <p className="mt-1 text-sm text-ink-2">One-off payment by card. {societyName} gets 100% of it.</p>

      <fieldset className="mt-5">
        <legend className={label}>Amount</legend>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPreset(p);
                setCustom("");
              }}
              aria-pressed={preset === p}
              className={cx("rounded-xl border py-3 text-[15px] font-medium tabular transition", preset === p ? "border-stone bg-stone text-white" : "border-line-strong bg-white hover:bg-paper-2")}
            >
              €{p / 100}
            </button>
          ))}
        </div>
        <div className="relative mt-2">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">€</span>
          <input
            className={cx(field, "pl-8 tabular", amountError && "border-bad")}
            placeholder="Other amount"
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setPreset(null);
            }}
            aria-label="Other amount in euro"
            aria-invalid={!!amountError}
          />
        </div>
        <p className={cx("mt-1 text-xs", amountError ? "text-bad" : "text-ink-3")}>{amountError ?? `Between ${fmtEur(MIN)} and ${fmtEur(MAX)}.`}</p>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="sponsor" className={label}>
          Your name or company
        </label>
        <input id="sponsor" className={field} placeholder="Acme Ltd" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <div className="mt-4">
        <label htmlFor="msg" className={label}>
          Message <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input id="msg" className={field} placeholder="Break a leg!" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={280} />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} className="h-4 w-4 accent-[var(--stone)]" />
        Show my name publicly on this page
      </label>

      {error && (
        <div className="mt-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <button type="submit" disabled={pending} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-stone px-5 py-3.5 text-[15px] font-semibold text-white hover:bg-stone-2 disabled:opacity-60">
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Pay {cents != null && !amountError ? fmtEur(cents) : ""}
      </button>
      <p className="mt-3 text-center text-xs text-ink-3">
        {simulated ? "Simulated checkout: Stripe keys aren't configured on this demo." : "Secure payment by Stripe Checkout (sandbox). Test card 4242 4242 4242 4242."}
      </p>
    </form>
  );
}
