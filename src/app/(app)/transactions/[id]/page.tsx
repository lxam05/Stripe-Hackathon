import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, HelpCircle, LoaderCircle, TriangleAlert, Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReviewActions } from "@/components/review-actions";
import { HoldTools, RerunJev } from "@/components/txn-tools";
import { MerchantAvatar, prettyMerchant } from "@/components/txn-list";
import { AiLabel, DecisionBadge, Notice, Panel, Pill, RiskBadge, SectionTitle, SeverityBadge, button, cx } from "@/components/ui";
import { SCORE_DECLINE, SCORE_FLAG } from "@/lib/authorize";
import { jevEnabled } from "@/lib/env";
import { requireActor } from "@/lib/guard";
import { mccInfo } from "@/lib/mcc";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/money";
import { comparablePurchases, getTransaction, latestAssessment, signalsOf } from "@/lib/queries";
import { canManageSociety, canSeeOwned, isOfficer } from "@/lib/access";
import { getDb } from "@/lib/db";

const ACTION_TEXT: Record<string, string> = {
  none: "No action needed",
  review: "Treasurer should review",
  request_receipt: "Ask the purchaser for a receipt",
  freeze_card: "Freeze the card",
};

export async function generateMetadata({ params }: PageProps<"/transactions/[id]">) {
  const t = getTransaction((await params).id);
  return { title: t ? `${prettyMerchant(t.merchant_name)} · ${fmtEur(t.amount_cents)}` : "Transaction" };
}

export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const t = getTransaction(id);
  if (!t || !canSeeOwned(actor, t)) notFound();
  const manage = canManageSociety(actor, t.society_id);
  const ra = latestAssessment(t.id);
  const signals = signalsOf(t);
  // Officers compare against their own history only, never other officers' spending.
  const comps = comparablePurchases(t, isOfficer(actor) ? t.member_id : undefined);
  const info = mccInfo(t.mcc);
  const flag = getDb().prepare(`SELECT * FROM flag WHERE authorization_id=?`).get(t.id) as
    | { id: string; severity: "low" | "medium" | "high"; status: string; card_frozen: number; resolution_note: string | null; resolved_at: string | null; resolved_by: string | null }
    | undefined;
  const card = getDb().prepare(`SELECT status FROM card WHERE id=?`).get(t.card_id) as { status: string };
  const jevFlags = ra ? (JSON.parse(ra.flags) as { code: string; severity: "low" | "medium" | "high"; evidence: string; verified?: boolean; unverified_refs?: string[] }[]) : [];
  const questions = ra ? (JSON.parse(ra.questions) as string[]) : [];
  const pending = !ra || ra.status === "pending";
  const isSeed = t.source === "seed";

  return (
    <>
      <AutoRefresh active={pending && !isSeed} />
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/transactions" className={button("ghost", "-ml-3")}>
          <ArrowLeft className="h-4 w-4" /> Transactions
        </Link>
        {t.event_id ? (
          <Link href={`/events/${t.event_id}`} className="text-sm text-ink-3 hover:text-ink">
            {t.event_name} →
          </Link>
        ) : (
          <Link href="/cards" className="text-sm text-ink-3 hover:text-ink">
            {t.event_name} →
          </Link>
        )}
      </div>

      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="hidden scale-125 sm:ml-1 sm:mr-2 sm:block">
          <MerchantAvatar name={t.merchant_name} declined={t.decision === "declined"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">
            {info.label} · MCC {t.mcc} · {t.merchant_city ? `${t.merchant_city}, ` : ""}
            {t.merchant_country}
          </p>
          <h1 className="display break-words text-4xl leading-tight sm:text-5xl">{prettyMerchant(t.merchant_name)}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {fmtDateTime(t.created_at)} · {t.member_name}&rsquo;s card ••{t.card_last4} · {t.event_name}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <div className={cx("display text-5xl tabular", t.decision === "declined" && "text-ink-3 line-through")}>{fmtEur(t.amount_cents)}</div>
          <div className="mt-2 flex gap-1.5 sm:justify-end">
            <DecisionBadge decision={t.decision} status={t.status} />
            {t.captured_cents > 0 && t.captured_cents !== t.amount_cents && <Pill className="bg-paper-2 text-ink-2">Captured {fmtEur(t.captured_cents)}</Pill>}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Layer 1: real-time rules ─────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          <Panel>
            <SectionTitle aside={<span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> {t.decision_ms.toFixed(1)} ms</span>}>
              1 · Real-time decision
            </SectionTitle>
            {t.decision === "declined" ? (
              <Notice tone="bad" title="Declined at the card">
                {t.decline_reason}
              </Notice>
            ) : (
              <Notice tone="ok" title="Authorised by the card network">
                Hard rules passed. A hold of {fmtEur(t.amount_cents)} was placed against society funds. Treasurer review happens separately after payment.
              </Notice>
            )}
            <ScoreMeter score={t.rules_score} />
            <ul className="mt-4 divide-y divide-line">
              {signals.length === 0 && <li className="py-3 text-sm text-ink-3">No rule signals fired.</li>}
              {signals.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-2.5">
                  <span className={cx("mt-0.5 w-9 shrink-0 rounded-md py-0.5 text-center font-mono text-[11px] font-semibold", s.hard ? "bg-bad-bg text-bad" : "bg-paper-2 text-ink-2")}>{s.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{s.label}</div>
                    <div className="text-[13px] text-ink-2">{s.evidence}</div>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular text-ink-2">{s.hard ? "Decline" : `+${s.points}`}</span>
                </li>
              ))}
            </ul>
            {t.status === "pending" && t.decision === "approved" && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">Simulate what the merchant does next</p>
                <HoldTools authId={t.id} />
              </div>
            )}
          </Panel>

          {comps.length > 0 && (
            <Panel>
              <SectionTitle aside={`same category (${info.group})`}>Comparable past purchases</SectionTitle>
              <ul className="divide-y divide-line text-sm">
                {comps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/transactions/${c.id}`} className="min-w-0 truncate hover:underline">
                      {prettyMerchant(c.merchant_name)} <span className="text-ink-3">· {c.event_name} · {fmtDate(c.created_at)}</span>
                    </Link>
                    <span className="tabular">{fmtEur(c.amount_cents)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* ── Layer 2: JEV ─────────────────────────────────────────── */}
        <div className="min-w-0 space-y-6">
          <Panel className={cx(ra?.source === "jev" && "ring-1 ring-mint")}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image src="/art/jev.webp" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">2 · JEV risk analysis</h2>
                  <p className="text-xs text-ink-3">Advises after the decision. Can raise suspicion, never approve.</p>
                </div>
              </div>
              {ra && !pending && <AiLabel fallback={ra.source !== "jev"} />}
            </div>

            {pending ? (
              <div className="flex items-center gap-3 rounded-xl bg-paper-2 px-4 py-6 text-sm text-ink-2">
                <LoaderCircle className="h-5 w-5 animate-spin text-stone-2" /> JEV is analysing this purchase against the society&rsquo;s history…
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={ra!.risk_level} />
                  {ra!.risk_score != null && <Pill className="bg-paper-2 text-ink-2 tabular">Score {ra!.risk_score}/100</Pill>}
                  {ra!.confidence != null && <Pill className="bg-paper-2 text-ink-2 tabular">Confidence {Math.round(ra!.confidence * 100)}%</Pill>}
                </div>
                <p className="mt-3 text-[16px] leading-relaxed text-ink">{ra!.summary}</p>

                {ra!.source !== "jev" && (
                  <div className="mt-4">
                    <Notice tone={isSeed ? "info" : "warn"} title={isSeed ? "Seeded history: rules-only result" : "AI analysis unavailable: rules-only result"}>
                      {ra!.fallback_reason}
                      {!jevEnabled() && " Add OPENROUTER_API_KEY to .env to enable JEV."}
                    </Notice>
                  </div>
                )}

                {jevFlags.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {jevFlags.map((f, i) => (
                      <li key={i} className="rounded-xl border border-line p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-ink-2">{f.code}</span>
                          <SeverityBadge severity={f.severity} />
                          {f.verified === false ? (
                            <Pill className="bg-warn-bg text-warn">
                              <TriangleAlert className="h-3 w-3" /> Unverified: {f.unverified_refs?.join(", ")} not in input
                            </Pill>
                          ) : (
                            <Pill className="bg-ok-bg text-ok">
                              <CircleCheck className="h-3 w-3" /> Evidence checked
                            </Pill>
                          )}
                        </div>
                        <p className="mt-1.5 text-[13px] text-ink-2">{f.evidence}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {ra!.recommended_action && (
                  <p className="mt-4 text-sm">
                    <span className="text-ink-3">Recommends: </span>
                    <b className="font-medium">{ACTION_TEXT[ra!.recommended_action] ?? ra!.recommended_action}</b>
                  </p>
                )}
                {questions.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-3">
                      <HelpCircle className="h-3.5 w-3.5" /> Ask the purchaser
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                      {questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {ra!.action_taken && (
                  <p className="mt-4 rounded-lg bg-paper-2 px-3 py-2 text-xs text-ink-2">
                    <b className="font-medium">Policy outcome:</b> {ra!.action_taken}
                  </p>
                )}
                {ra!.source === "jev" && (
                  <p className="mt-3 text-[11px] text-ink-3">
                    {ra!.model} · {ra!.prompt_version} · {ra!.latency_ms} ms · {ra!.tokens_in ?? "?"}→{ra!.tokens_out ?? "?"} tokens
                    {ra!.cost_usd != null && ` · $${ra!.cost_usd.toFixed(5)}`} · temperature 0 · pseudonymised input
                  </p>
                )}
                {jevEnabled() && manage && (
                  <div className="mt-4">
                    <RerunJev authId={t.id} label={ra!.source === "jev" ? "Re-run JEV" : "Run JEV analysis"} />
                  </div>
                )}
              </>
            )}
          </Panel>

          {flag && (
            <Panel className={cx(flag.status === "open" && "ring-1 ring-coral/50")}>
              <SectionTitle aside={<SeverityBadge severity={flag.severity} />}>Review</SectionTitle>
              {flag.card_frozen ? (
                <div className="mb-3">
                  <Notice tone="info" title="Card was auto-frozen">
                    Rules and JEV both rated this high risk, so Balance froze the card until you review it.
                  </Notice>
                </div>
              ) : null}
              {["open", "receipt_requested"].includes(flag.status) ? (
                manage ? (
                  <ReviewActions flagId={flag.id} cardStatus={card.status} authStatus={t.status} status={flag.status} />
                ) : (
                  <p className="text-sm text-ink-2">Your treasurer has been notified and will review this purchase.</p>
                )
              ) : (
                <Notice tone={flag.status === "fraud" ? "bad" : "ok"} title={flag.status === "fraud" ? "Resolved as misuse" : "Resolved as legitimate"}>
                  {flag.resolution_note ?? "No note added."} {flag.resolved_at && `(${fmtDate(flag.resolved_at)})`}
                </Notice>
              )}
              {flag.status === "receipt_requested" && <p className="mt-3 text-xs text-ink-3">Receipt requested. Close the flag once it arrives.</p>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-ink-2">Rules score</span>
        <span className="display text-2xl tabular">{score}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-ok-bg via-warn-bg to-bad-bg">
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow" style={{ left: `${Math.min(100, score)}%` }} />
        <div className="absolute inset-y-0 w-px bg-ink-3/50" style={{ left: `${SCORE_FLAG}%` }} />
        <div className="absolute inset-y-0 w-px bg-ink-3/50" style={{ left: `${SCORE_DECLINE}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-ink-3">
        <span className="absolute left-0">0 low risk</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${SCORE_FLAG}%` }}>
          {SCORE_FLAG} flag
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${SCORE_DECLINE}%` }}>
          {SCORE_DECLINE} high risk
        </span>
      </div>
    </div>
  );
}
