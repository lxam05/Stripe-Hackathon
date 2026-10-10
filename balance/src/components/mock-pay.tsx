"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, Lock } from "lucide-react";

export function MockPay({ session, cancelHref, amountLabel }: { session: string; cancelHref: string; amountLabel: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await fetch(`/api/checkout/mock/${session}`, { method: "POST" });
            const j = await res.json();
            if (!res.ok) return setError(j.error?.message ?? "Payment failed.");
            window.location.href = j.redirect;
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone px-5 py-3.5 font-semibold text-white hover:bg-stone-2 disabled:opacity-60"
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Pay {amountLabel}
      </button>
      <Link href={cancelHref} className="mt-3 block text-center text-sm text-ink-3 hover:text-ink">
        Cancel and go back
      </Link>
      {error && (
        <p className="mt-3 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
