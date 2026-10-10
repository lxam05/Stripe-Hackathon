import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck, HelpCircle, LoaderCircle, TriangleAlert, Zap } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { RerunJev } from "@/components/txn-tools";
import { prettyMerchant } from "@/components/txn-list";
import { AiLabel, DecisionBadge, Notice, Panel, Pill, RiskBadge, SectionTitle, SeverityBadge, button, cx } from "@/components/ui";
import { SCORE_DECLINE, SCORE_FLAG } from "@/lib/authorize";
import { jevEnabled } from "@/lib/env";
import { requireActor } from "@/lib/guard";
import { mccInfo } from "@/lib/mcc";
import { fmtDateTime, fmtEur } from "@/lib/money";
import { getTransaction, latestAssessment, signalsOf } from "@/lib/queries";
import { canManageSociety, canSeeOwned } from "@/lib/access";

export const metadata = { title: "Risk engine · purchase" };

/** Engine internals for one purchase: rule signals and points, then JEV's raw structured output. */
export default async function EngineTxnPage({ params }: PageProps<"/engine/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const t = getTransaction(id);
  if (!t || !canSeeOwned(actor, t)) notFound();
  const manage = canManageSociety(actor, t.society_id);
  const ra = latestAssessment(t.id);
  const signals = signalsOf(t);
  const info = mccInfo(t.mcc);
  const jevFlags = ra ? (JSON.parse(ra.flags) as { code: string; severity: "low" | "medium" | "high"; evidence: string; verified?: boolean; unverified_refs?: string[] }[]) : [];
  const questions = ra ? (JSON.parse(ra.questions) as string[]) : [];
  const pending = !ra || ra.status === "pending";
  const isSeed = t.source === "seed";

  return (
    <>
      <AutoRefresh active={pending && !isSeed} />
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/engine" className={button("ghost", "-ml-3")}>
          <ArrowLeft className="h-4 w-4" /> Risk engine
        </Link>
        <Link href={`/transactions/${t.id}`} className="text-sm text-ink-3 hover:text-ink">
          What the user sees →
        </Link>
      </div>

      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">
            {info.label} · MCC {t.mcc} · group {info.group} · {t.merchant_country}
          </p>
          <h1 className="display break-words text-4xl leading-tight">
            {prettyMerchant(t.merchant_name)} · {fmtEur(t.amount_cents)}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {fmtDateTime(t.created_at)} · {t.id} · source {t.source}
          </p>
        </div>
        <DecisionBadge decision={t.decision} status={t.status} />
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <SectionTitle aside={<span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> {t.decision_ms.toFixed(1)} ms</span>}>
            1 · Real-time rules
          </SectionTitle>
          {t.decision === "declined" ? (
            <Notice tone="bad" title="Declined at authorisation">
              {t.decline_reason}
            </Notice>
          ) : (
            <Notice tone="ok" title="Authorised">
              No hard rule fired. Hold of {fmtEur(t.amount_cents)} placed; review happens after payment.
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
        </Panel>

        <Panel className={cx(ra?.source === "jev" && "ring-1 ring-mint")}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/art/jev.webp" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
              <div>
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">2 · JEV via OpenRouter</h2>
                <p className="text-xs text-ink-3">Advises after the decision. Can raise suspicion, never approve.</p>
              </div>
            </div>
            {ra && !pending && <AiLabel fallback={ra.source !== "jev"} />}
          </div>

          {pending ? (
            <div className="flex items-center gap-3 rounded-xl bg-paper-2 px-4 py-6 text-sm text-ink-2">
              <LoaderCircle className="h-5 w-5 animate-spin text-stone-2" /> Waiting for OpenRouter…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <RiskBadge level={ra!.risk_level} />
                {ra!.risk_score != null && <Pill className="bg-paper-2 text-ink-2 tabular">riskScore {ra!.risk_score}/100</Pill>}
                {ra!.confidence != null && <Pill className="bg-paper-2 text-ink-2 tabular">confidence {Math.round(ra!.confidence * 100)}%</Pill>}
                {ra!.recommended_action && <Pill className="bg-paper-2 text-ink-2 font-mono">{ra!.recommended_action}</Pill>}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{ra!.summary}</p>

              {ra!.source !== "jev" && (
                <div className="mt-4">
                  <Notice tone={isSeed ? "info" : "warn"} title={isSeed ? "Seeded history (JEV not run)" : "Rules fallback"}>
                    {ra!.fallback_reason}
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

              {questions.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-ink-3">
                    <HelpCircle className="h-3.5 w-3.5" /> questions
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
                <p className="mt-3 font-mono text-[11px] text-ink-3">
                  {ra!.model} · {ra!.prompt_version} · {ra!.latency_ms} ms · {ra!.tokens_in ?? "?"}→{ra!.tokens_out ?? "?"} tokens
                  {ra!.cost_usd != null && ` · $${ra!.cost_usd.toFixed(5)}`} · temperature 0 · pseudonymised input
                </p>
              )}
              {jevEnabled() && manage && (
                <div className="mt-4">
                  <RerunJev authId={t.id} label={ra!.source === "jev" ? "Re-run JEV" : "Run JEV now"} />
                </div>
              )}
            </>
          )}
        </Panel>
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
