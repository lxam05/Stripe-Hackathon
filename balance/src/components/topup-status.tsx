"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

/** Shows "confirmed" only once payment is confirmed; until then polls (PRD §6.1 step 7). */
export function TopUpStatus({ sessionId, initiallyPaid, children }: { sessionId: string; initiallyPaid: boolean; children: ReactNode }) {
  const [paid, setPaid] = useState(initiallyPaid);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (paid || tries > 20) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/topups/status?session_id=${encodeURIComponent(sessionId)}`).then((x) => x.json()).catch(() => null);
      if (r?.paid) setPaid(true);
      setTries((n) => n + 1);
    }, 1500);
    return () => clearTimeout(t);
  }, [paid, tries, sessionId]);

  if (paid) return <div className="rise">{children}</div>;
  return (
    <div>
      <h1 className="display text-4xl">Payment received, confirming…</h1>
      <p className="mt-3 inline-flex items-center gap-2 text-ink-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {tries > 20 ? "This is taking longer than usual. Refresh in a minute; you won't be charged twice." : "Waiting for Stripe to confirm the payment."}
      </p>
    </div>
  );
}
