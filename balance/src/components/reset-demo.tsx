"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { button } from "./ui";

export function ResetDemo() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className={button("secondary")}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Reset all demo data? This regenerates the synthetic year and discards your changes.")) return;
          start(async () => {
            const res = await fetch("/api/admin/reset", { method: "POST" });
            const j = await res.json();
            setMsg(res.ok ? `Regenerated ${j.summary.purchases} purchases across ${j.summary.societies} societies.` : (j.error?.message ?? "Reset failed."));
            router.refresh();
          });
        }}
      >
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reset demo data
      </button>
      {msg && <span className="text-sm text-ink-2">{msg}</span>}
    </div>
  );
}
