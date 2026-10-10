"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Eye, LoaderCircle, Plus } from "lucide-react";
import { Panel, cx, Notice } from "./ui";

const ACTIONS = [
  { value: "block", label: "Block", cls: "bg-bad-bg text-bad" },
  { value: "review", label: "Review", cls: "bg-warn-bg text-warn" },
  { value: "allow", label: "Allow", cls: "bg-ok-bg text-ok" },
] as const;

export function PolicyEditor({
  policies,
  mccs,
  editable,
}: {
  policies: { mcc: string; action: string; preapproved: string[] }[];
  mccs: { code: string; label: string; defaultPolicy: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addMcc, setAddMcc] = useState("");
  const label = (c: string) => mccs.find((m) => m.code === c)?.label ?? `MCC ${c}`;

  const save = (mcc: string, action: string, preapproved: string[]) => {
    setBusy(mcc);
    setError(null);
    start(async () => {
      const res = await fetch("/api/admin/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mcc, action, preapproved }),
      });
      if (!res.ok) setError((await res.json()).error?.message ?? "Couldn't save.");
      setBusy(null);
      router.refresh();
    });
  };
  const listed = new Set(policies.map((p) => p.mcc));

  return (
    <Panel pad={false}>
      {!editable && (
        <div className="px-5 pt-4">
          <Notice tone="info">Sign in as the Societies Office to change UCD-wide policy.</Notice>
        </div>
      )}
      <ul className="divide-y divide-line">
        {policies.map((p) => (
          <li key={p.mcc} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
            {p.action === "block" ? <Ban className="h-4 w-4 text-bad" /> : <Eye className="h-4 w-4 text-warn" />}
            <span className="w-12 font-mono text-xs text-ink-3">{p.mcc}</span>
            <span className="min-w-0 flex-1 text-sm">
              {label(p.mcc)}
              {p.preapproved.length > 0 && <span className="block text-xs text-ink-3">Pre-approved for {p.preapproved.join(", ")} events</span>}
            </span>
            {busy === p.mcc && pending && <LoaderCircle className="h-4 w-4 animate-spin text-ink-3" />}
            <div className="flex rounded-full border border-line bg-paper p-0.5" role="radiogroup" aria-label={`Policy for MCC ${p.mcc}`}>
              {ACTIONS.map((a) => (
                <button
                  key={a.value}
                  role="radio"
                  aria-checked={p.action === a.value}
                  disabled={!editable || pending}
                  onClick={() => save(p.mcc, a.value, p.preapproved)}
                  className={cx("rounded-full px-2.5 py-1 text-xs font-medium transition disabled:cursor-default", p.action === a.value ? a.cls : "text-ink-3 hover:text-ink")}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <select className="min-w-0 flex-1 rounded-full border border-line-strong bg-white px-3 py-2 text-sm" value={addMcc} onChange={(e) => setAddMcc(e.target.value)} aria-label="Add a category">
            <option value="">Add a category to block or review…</option>
            {mccs
              .filter((m) => !listed.has(m.code))
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} · {m.label}
                </option>
              ))}
          </select>
          <button
            className="inline-flex items-center gap-1 rounded-full bg-stone px-3.5 py-2 text-sm text-white disabled:opacity-50"
            disabled={!addMcc || pending}
            onClick={() => {
              save(addMcc, "review", []);
              setAddMcc("");
            }}
          >
            <Plus className="h-4 w-4" /> Add as review
          </button>
        </div>
      )}
      {error && (
        <div className="px-5 pb-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Panel>
  );
}
