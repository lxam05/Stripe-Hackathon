"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BadgeCheck, LoaderCircle, OctagonX, Receipt } from "lucide-react";
import { button, cx, field, Notice } from "./ui";

export function ReviewActions({
  flagId,
  cardStatus,
  authStatus,
  status,
  compact,
}: {
  flagId: string;
  cardStatus: string;
  authStatus: string;
  status: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [unfreeze, setUnfreeze] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const resolve = (resolution: "legit" | "receipt_requested" | "fraud") => {
    if (resolution === "fraud" && !window.confirm("Mark as misuse? This cancels the card immediately. You can issue a replacement from the event page.")) return;
    setBusy(resolution);
    setError(null);
    start(async () => {
      const res = await fetch(`/api/flags/${flagId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution, note, unfreeze: resolution === "legit" && unfreeze, reverse: resolution === "fraud" }),
      });
      setBusy(null);
      if (!res.ok) return setError((await res.json()).error?.message ?? "Couldn't save that.");
      setDone(resolution === "legit" ? "Marked legitimate. JEV will treat similar purchases as normal." : resolution === "fraud" ? "Card cancelled and incident recorded." : "Receipt requested. The flag stays open until you close it.");
      router.refresh();
    });
  };
  const spin = (k: string) => pending && busy === k;

  return (
    <div className="space-y-3">
      {!compact && (
        <textarea
          className={cx(field, "text-sm")}
          rows={2}
          placeholder="Resolution note (optional), e.g. “Checked with Cian: hardware for the set.”"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      )}
      {cardStatus === "inactive" && (
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={unfreeze} onChange={(e) => setUnfreeze(e.target.checked)} className="h-4 w-4 accent-[var(--stone)]" />
          Unfreeze the card if I mark this legitimate
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={button("primary")} disabled={pending} onClick={() => resolve("legit")}>
          {spin("legit") ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Legitimate
        </button>
        {status !== "receipt_requested" && (
          <button className={button("secondary")} disabled={pending} onClick={() => resolve("receipt_requested")}>
            {spin("receipt_requested") ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Request receipt
          </button>
        )}
        <button className={button("danger")} disabled={pending || cardStatus === "canceled"} onClick={() => resolve("fraud")}>
          {spin("fraud") ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <OctagonX className="h-4 w-4" />} Misuse · cancel card
        </button>
      </div>
      {authStatus === "pending" && <p className="text-xs text-ink-3">Marking misuse also releases the held amount back to the society.</p>}
      {error && <Notice tone="bad">{error}</Notice>}
      {done && <Notice tone="ok">{done}</Notice>}
    </div>
  );
}
