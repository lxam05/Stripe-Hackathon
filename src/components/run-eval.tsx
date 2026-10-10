"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { button } from "./ui";

export function RunEvalButton({ running, done, total, model }: { running: boolean; done: number; total: number; model: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (running) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-2">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Running JEV · {done}/{total}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-bad">{error}</span>}
      <button
        className={button("secondary")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!window.confirm(`Run JEV (${model}) on the evaluation set? That's roughly 180 OpenRouter calls.`)) return;
            const res = await fetch("/api/eval/run", { method: "POST" });
            if (!res.ok) setError((await res.json()).error?.message ?? "Couldn't start.");
            router.refresh();
          })
        }
      >
        <FlaskConical className="h-4 w-4" /> Run JEV evaluation
      </button>
    </div>
  );
}
