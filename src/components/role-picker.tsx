"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { cx } from "./ui";

export interface Persona {
  actor: string;
  name: string;
  role: string;
  detail: string;
  image: string;
  recommended?: boolean;
}

export function RolePicker({ personas, others }: { personas: Persona[]; others: Persona[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = (actor: string) => {
    setWhich(actor);
    setError(null);
    start(async () => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error?.message ?? "Couldn't sign in");
        return;
      }
      router.push(j.redirect);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {personas.map((p) => (
          <button
            key={p.actor}
            onClick={() => choose(p.actor)}
            disabled={pending}
            className={cx(
              "group relative flex flex-col rounded-2xl border bg-surface p-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]",
              p.recommended ? "border-stone-2 ring-2 ring-mint" : "border-line",
            )}
          >
            {p.recommended && (
              <span className="absolute -top-2.5 left-4 rounded-full bg-stone px-2 py-0.5 text-[11px] font-medium text-white">Start the demo here</span>
            )}
            <Image src={p.image} alt="" width={64} height={64} className="mb-3 h-14 w-14 rounded-2xl" />
            <div className="font-medium text-ink">{p.name}</div>
            <div className="text-sm text-ink-2">{p.role}</div>
            <div className="mt-1 text-xs text-ink-3">{p.detail}</div>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-stone-2">
              {pending && which === p.actor ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}
            </span>
          </button>
        ))}
      </div>
      <details className="mt-4 rounded-2xl border border-line bg-surface/70 px-4 py-3 text-sm">
        <summary className="cursor-pointer text-ink-2">Sign in as another society&rsquo;s treasurer</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {others.map((p) => (
            <button key={p.actor} onClick={() => choose(p.actor)} disabled={pending} className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-paper-2">
              <Image src={p.image} alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{p.name}</span>
                <span className="block truncate text-xs text-ink-3">{p.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </details>
      {error && <p className="mt-3 text-sm text-bad" role="alert">{error}</p>}
    </div>
  );
}
