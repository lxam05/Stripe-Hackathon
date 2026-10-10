"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Sparkles, Undo2, CircleCheck } from "lucide-react";
import { button, Notice } from "./ui";

export function RerunJev({ authId, label = "Run JEV analysis" }: { authId: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        className={button("secondary")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await fetch(`/api/jev/rerun/${authId}`, { method: "POST" });
            if (!res.ok) setError((await res.json()).error?.message ?? "JEV couldn't run.");
            router.refresh();
          })
        }
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? "JEV is analysing…" : label}
      </button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}

export function HoldTools({ authId }: { authId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = (path: string, body?: object) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/transactions/${authId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) setError((await res.json()).error?.message ?? "That didn't work.");
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-28 rounded-full border border-line-strong bg-white px-3 py-2 text-sm tabular"
          placeholder="Same amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Capture amount in euro (optional)"
        />
        <button className={button("secondary")} disabled={pending} onClick={() => go("capture", amount ? { amount } : {})}>
          <CircleCheck className="h-4 w-4" /> Merchant captures
        </button>
        <button className={button("ghost")} disabled={pending} onClick={() => go("reverse")}>
          <Undo2 className="h-4 w-4" /> Merchant reverses
        </button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
