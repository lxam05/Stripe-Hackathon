import Link from "next/link";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { mccInfo } from "@/lib/mcc";
import { fmtDateTime, fmtEur } from "@/lib/money";
import type { TxnRow } from "@/lib/queries";
import { cx, DecisionBadge } from "./ui";

export function TxnList({ rows, showSociety, showEvent = true, empty }: { rows: TxnRow[]; showSociety?: boolean; showEvent?: boolean; empty?: string }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-ink-3">{empty ?? "No purchases yet."}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((t) => {
        const pending = t.ra_status === "pending";
        const review = t.flag_status && ["open", "receipt_requested"].includes(t.flag_status);
        return (
          <li key={t.id}>
            <Link href={`/transactions/${t.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-2/60 sm:px-5">
              <MerchantAvatar name={t.merchant_name} declined={t.decision === "declined"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink">{prettyMerchant(t.merchant_name)}</span>
                  {review && <span className="h-2 w-2 shrink-0 rounded-full bg-coral sm:hidden" aria-label="Needs review" />}
                </div>
                <div className="truncate text-xs text-ink-3">
                  {fmtDateTime(t.created_at)} · {mccInfo(t.mcc).label}
                  {showEvent && <> · {t.event_name}</>}
                  {showSociety && <> · {t.society_name.replace(/^UCD /, "")}</>}
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                {review ? (
                  <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-medium text-[#a8452c]">Needs review</span>
                ) : (
                  pending && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2.5 py-1 text-xs text-ink-2">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Checking
                    </span>
                  )
                )}
                <DecisionBadge decision={t.decision} status={t.status} />
              </div>
              <div className={cx("w-24 shrink-0 text-right font-medium tabular", t.decision === "declined" ? "text-ink-3 line-through" : "text-ink")}>
                {fmtEur(t.captured_cents || t.amount_cents)}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function prettyMerchant(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\.Com\b/g, ".com")
    .replace(/\.Ie\b/g, ".ie")
    .replace(/\.De\b/g, ".de")
    .replace(/\bAtm\b/g, "ATM")
    .replace(/\bUcd\b/g, "UCD")
    .replace(/\bAv\b/g, "AV")
    .replace(/\bRs\b/g, "RS")
    .replace(/\bYha\b/g, "YHA")
    .replace(/\bJd\b/g, "JD")
    .replace(/\bH&M\b/gi, "H&M")
    .replace(/\bB&H\b/gi, "B&H");
}

const AVATAR_TONES = ["bg-mint text-stone", "bg-[#fbe3da] text-[#a8452c]", "bg-[#e3e4fb] text-[#3b3f8f]", "bg-[#f8ecc9] text-[#7a5a10]", "bg-[#e1f0da] text-[#2f5d2a]"];

export function MerchantAvatar({ name, declined }: { name: string; declined?: boolean }) {
  const letters = name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const tone = AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold", declined ? "bg-paper-2 text-ink-3" : tone)}
      aria-hidden
    >
      {letters}
    </span>
  );
}
