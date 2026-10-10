"use client";

import { useState, useTransition } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function SubscribeButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await fetch("/api/billing/checkout", { method: "POST" });
            const j = await res.json();
            if (!res.ok) return setError(j.error?.message ?? "Couldn't start checkout.");
            window.location.href = j.url;
          })
        }
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-butter px-5 py-3 text-[15px] font-semibold text-[#3d2a04] transition hover:bg-[#f5d48a] disabled:opacity-60 sm:w-auto"
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        Subscribe for €49/year <ArrowRight className="h-4 w-4" />
      </button>
      {error && (
        <p className="mt-2 text-sm text-[#ffd2c7]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
