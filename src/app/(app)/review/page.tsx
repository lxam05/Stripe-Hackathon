import Image from "next/image";
import Link from "next/link";
import { Snowflake } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewActions } from "@/components/review-actions";
import { prettyMerchant } from "@/components/txn-list";
import { AiLabel, EmptyState, PageHeader, Panel, Pill, SectionTitle, SeverityBadge, cx } from "@/components/ui";
import { requireActor } from "@/lib/guard";
import { mccInfo } from "@/lib/mcc";
import { fmtDateTime, fmtEur, relativeTime } from "@/lib/money";
import { listFlags, signalsOf } from "@/lib/queries";
import { isOfficer, scopeOf } from "@/lib/access";

export const metadata = { title: "Review queue" };

export default async function ReviewPage() {
  const actor = await requireActor();
  const scope = scopeOf(actor);
  const open = listFlags({ ...scope, status: "open" });
  const resolved = listFlags({ ...scope, status: "resolved" }).slice(0, 8);
  const officer = isOfficer(actor);
  const manage = !officer;

  return (
    <>
      <AutoRefresh active={open.some((f) => f.ra_status === "pending")} />
      <PageHeader eyebrow={actor.kind === "member" ? actor.societyName : "All societies"} title={officer ? "Flags on my purchases" : "Review queue"}>
        {officer
          ? "Purchases on your card that the rules or JEV asked your treasurer to check. Your treasurer resolves them; have the receipt ready."
          : "Sorted by severity, then age. Each flag shows the evidence behind it, so you can decide in seconds."}
      </PageHeader>

      {open.length === 0 ? (
        <Panel className="mb-10">
          <EmptyState title={officer ? "Nothing flagged on your card" : "Nothing needs your attention"}>
            {officer ? "If a purchase on your card needs a second look, it shows up here." : <>JEV and the rules engine will flag anything that doesn&rsquo;t fit. You&rsquo;ll see it here first.</>}
          </EmptyState>
        </Panel>
      ) : (
        <div className="mb-10 space-y-4">
          {open.map((f) => {
            const chips = signalsOf(f).filter((s) => s.points > 0 || s.hard).slice(0, 5);
            return (
              <Panel key={f.f_id} className={cx("rise", f.f_severity === "high" && "ring-1 ring-bad/30")}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={f.f_severity} />
                      {f.f_status === "receipt_requested" && <Pill className="bg-info-bg text-info">Receipt requested</Pill>}
                      {f.card_status === "inactive" && (
                        <Pill className="bg-info-bg text-info">
                          <Snowflake className="h-3.5 w-3.5" /> Card frozen
                        </Pill>
                      )}
                      {f.decision === "declined" && <Pill className="bg-bad-bg text-bad">Declined</Pill>}
                      <span className="text-xs text-ink-3">{relativeTime(f.f_created_at)}</span>
                    </div>
                    <Link href={`/transactions/${f.id}`} className="mt-2 block hover:underline">
                      <span className="display text-2xl text-ink">{prettyMerchant(f.merchant_name)}</span>
                      <span className="ml-2 text-lg tabular text-ink-2">{fmtEur(f.amount_cents)}</span>
                    </Link>
                    <p className="text-sm text-ink-3">
                      {mccInfo(f.mcc).label} · {fmtDateTime(f.created_at)} · {f.member_name} · {f.event_name}
                      {actor.kind === "admin" && <> · {f.society_name}</>}
                    </p>
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-paper-2/70 p-3">
                      {f.ra_source === "jev" ? <Image src="/art/jev.webp" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-lg" /> : null}
                      <div className="min-w-0">
                        <p className="text-[15px] leading-relaxed text-ink">{f.ra_summary || f.f_reason}</p>
                        <div className="mt-1.5">
                          <AiLabel fallback={f.ra_source !== "jev"} />
                        </div>
                      </div>
                    </div>
                    {chips.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {chips.map((s) => (
                          <span key={s.id} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-2" title={s.label}>
                            {s.evidence}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {manage && (
                    <div className="md:w-[340px] md:shrink-0">
                      <ReviewActions flagId={f.f_id} cardStatus={f.card_status} authStatus={f.status} status={f.f_status} />
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <>
          <SectionTitle>Recently resolved</SectionTitle>
          <Panel pad={false}>
            <ul className="divide-y divide-line">
              {resolved.map((f) => (
                <li key={f.f_id}>
                  <Link href={`/transactions/${f.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-paper-2/50">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", f.f_status === "fraud" ? "bg-bad" : "bg-ok")} />
                    <span className="min-w-0 flex-1 truncate">
                      <b className="font-medium">{prettyMerchant(f.merchant_name)}</b> <span className="text-ink-3">· {f.event_name}</span>
                    </span>
                    <span className="text-ink-2">{f.f_status === "fraud" ? "Misuse" : "Legitimate"}</span>
                    <span className="w-20 text-right tabular">{fmtEur(f.amount_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}
