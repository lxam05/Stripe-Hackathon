"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Ban, CircleCheck, LoaderCircle, Zap } from "lucide-react";
import { fmtEur, parseEuroToCents } from "@/lib/money";
import { Notice, Panel, button, cx, field, label } from "./ui";

interface CardOpt {
  id: string;
  label: string;
  society: string;
  holder: string;
  status: string;
  /** Event the card is spending for; null = general spending. */
  eventName: string | null;
  eventType: string | null;
  cap: number;
  remaining: number;
  monthLeft: number;
}
interface Preset {
  label: string;
  merchant: string;
  mcc: string;
  amount: number;
  country: string;
  city: string;
  hint: string;
  time?: string;
}
interface Result {
  authorization_id: string | null;
  approved: boolean;
  decline_reason: string | null;
  rules_score: number;
  signals: { id: string; label: string; points: number; hard?: boolean; evidence: string }[];
  decision_ms: number;
  mode: string;
  captured: boolean;
  merchant: string;
  amount: number;
}

export function Simulator({
  cards,
  initialCard,
  presets,
  mccs,
  today,
}: {
  cards: CardOpt[];
  initialCard?: string;
  presets: Preset[];
  mccs: { code: string; label: string; policy: string }[];
  today: string;
  stripe: boolean;
}) {
  const router = useRouter();
  const [cardId, setCardId] = useState(initialCard && cards.some((c) => c.id === initialCard) ? initialCard : cards[0].id);
  const [merchant, setMerchant] = useState<string>(presets[0].merchant);
  const [mcc, setMcc] = useState<string>(presets[0].mcc);
  const [amount, setAmount] = useState(String(presets[0].amount));
  const [country, setCountry] = useState("IE");
  const [useTime, setUseTime] = useState(false);
  const [time, setTime] = useState(`${today}T12:00`);
  const [capture, setCapture] = useState(true);
  const [active, setActive] = useState(presets[0].label);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [pending, start] = useTransition();

  const card = cards.find((c) => c.id === cardId)!;
  const applyPreset = (p: Preset) => {
    setActive(p.label);
    setMerchant(p.merchant);
    setMcc(p.mcc);
    setAmount(String(p.amount));
    setCountry(p.country);
    if (p.time) {
      setUseTime(true);
      setTime(`${today}T${p.time}`);
    } else setUseTime(false);
  };

  const fire = () => {
    setError(null);
    const cents = parseEuroToCents(amount);
    if (cents == null || cents < 1) return setError("Enter an amount like 184 or 0.01.");
    start(async () => {
      const res = await fetch("/api/simulator/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          card_id: cardId,
          amount_cents: cents,
          mcc,
          merchant_name: merchant,
          country,
          local_time: useTime ? time : undefined,
          auto_capture: capture,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error?.message ?? "The authorisation failed.");
      setResults((r) => [{ ...j, merchant, amount: cents }, ...r].slice(0, 6));
      router.refresh();
    });
  };

  const latest = results[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <Panel className="space-y-5">
        <div>
          <label htmlFor="card" className={label}>
            Card
          </label>
          <select id="card" className={field} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.society.replace(/^UCD /, "")}
                {c.status === "inactive" ? " (frozen)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-3">
            {card.eventName ? (
              <>
                Spending for <b className="font-medium text-ink-2">{card.eventName}</b> ({card.eventType}) · {fmtEur(card.remaining)} left on its budget
              </>
            ) : (
              <>General spending · {fmtEur(Math.max(0, card.remaining))} available</>
            )}{" "}
            · review above {fmtEur(card.cap)} a purchase · {fmtEur(Math.max(0, card.monthLeft))} to monthly review threshold
          </p>
        </div>

        <div>
          <span className={label}>Merchant presets</span>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cx("rounded-xl border px-3 py-2 text-left text-sm transition", active === p.label ? "border-stone bg-stone text-white" : "border-line-strong bg-white hover:bg-paper-2")}
              >
                <span className="block font-medium">{p.label}</span>
                <span className={cx("block text-[11px]", active === p.label ? "text-white/70" : "text-ink-3")}>{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <label htmlFor="merchant" className={label}>
              Merchant descriptor
            </label>
            <input id="merchant" className={cx(field, "font-mono text-sm")} value={merchant} onChange={(e) => { setMerchant(e.target.value); setActive(""); }} maxLength={120} />
          </div>
          <div>
            <label htmlFor="amount" className={label}>
              Amount (€)
            </label>
            <input id="amount" className={cx(field, "tabular")} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setActive(""); }} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
          <div>
            <label htmlFor="mcc" className={label}>
              Merchant category (MCC)
            </label>
            <select id="mcc" className={field} value={mcc} onChange={(e) => { setMcc(e.target.value); setActive(""); }}>
              {mccs.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} · {m.label}
                  {m.policy === "block" ? " (blocked)" : m.policy === "review" ? " (review)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="country" className={label}>
              Country
            </label>
            <input id="country" className={cx(field, "uppercase")} maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={useTime} onChange={(e) => setUseTime(e.target.checked)} className="h-4 w-4 accent-[var(--stone)]" />
            Override time
            {useTime && <input type="datetime-local" className="rounded-lg border border-line-strong bg-white px-2 py-1 text-sm" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Purchase time (Dublin)" />}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={capture} onChange={(e) => setCapture(e.target.checked)} className="h-4 w-4 accent-[var(--stone)]" />
            Merchant captures immediately
          </label>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="button" onClick={fire} disabled={pending} className={button("coral", "w-full py-3 text-[15px]")}>
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {pending ? "Authorising…" : `Fire authorisation`}
        </button>
      </Panel>

      <div className="space-y-4">
        {!latest ? (
          <Panel className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <Zap className="h-8 w-8 text-ink-3" />
            <p className="mt-3 max-w-xs text-sm text-ink-2">Pick a preset and fire. You&rsquo;ll see the real-time decision here, then what the cardholder and treasurer see.</p>
          </Panel>
        ) : (
          <Panel className={cx("rise", latest.approved ? "ring-1 ring-ok/30" : "ring-1 ring-bad/30")} key={latest.authorization_id ?? results.length}>
            <div className="flex items-center gap-3">
              <span className={cx("flex h-11 w-11 items-center justify-center rounded-full", latest.approved ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad")}>
                {latest.approved ? <CircleCheck className="h-6 w-6" /> : <Ban className="h-6 w-6" />}
              </span>
              <div>
                <div className="display text-3xl">{latest.approved ? "Approved" : "Declined"}</div>
                <div className="text-xs text-ink-3">
                  {latest.decision_ms.toFixed(1)} ms decision · rules score {latest.rules_score} · {latest.mode === "stripe" ? "Stripe Issuing" : "MockAdapter"}
                  {latest.captured && " · captured"}
                </div>
              </div>
            </div>
            {latest.decline_reason && <p className="mt-3 text-sm text-bad">{latest.decline_reason}</p>}
            {latest.signals.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {latest.signals.map((s) => (
                  <li key={s.id} className="flex gap-2 text-[13px]">
                    <span className={cx("w-8 shrink-0 rounded font-mono text-[11px] font-semibold leading-5 text-center", s.hard ? "bg-bad-bg text-bad" : "bg-paper-2 text-ink-2")}>{s.id}</span>
                    <span className="text-ink-2">{s.evidence}</span>
                  </li>
                ))}
              </ul>
            )}
            {latest.authorization_id && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/transactions/${latest.authorization_id}`} className={button("primary")}>
                  See the purchase <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href={`/engine/${latest.authorization_id}`} className={button("ghost")}>
                  Engine view
                </Link>
              </div>
            )}
          </Panel>
        )}
        {results.length > 1 && (
          <Panel pad={false}>
            <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-3">Earlier this session</p>
            <ul className="divide-y divide-line">
              {results.slice(1).map((r, i) => (
                <li key={i}>
                  <Link href={r.authorization_id ? `/transactions/${r.authorization_id}` : "#"} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-paper-2/50">
                    <span className={cx("h-2 w-2 rounded-full", r.approved ? "bg-ok" : "bg-bad")} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.merchant}</span>
                    <span className="tabular">{fmtEur(r.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
