import Image from "next/image";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { prettyMerchant } from "@/components/txn-list";
import { Notice, PageHeader, Panel, Pill, RiskBadge, SectionTitle, cx } from "@/components/ui";
import { isAdmin, scopeOf } from "@/lib/access";
import { env, jevEnabled, stripeEnabled } from "@/lib/env";
import { requireActor } from "@/lib/guard";
import { fmtDateTime, fmtEur } from "@/lib/money";
import { engineStats, listAssessments } from "@/lib/queries";

export const metadata = { title: "Risk engine" };

/**
 * The technical view: JEV's live OpenRouter calls, the rules engine's scores, and the
 * integrations. Everywhere else in the app this is hidden behind plain-language reasons.
 */
export default async function EnginePage() {
  const actor = await requireActor();
  const scope = scopeOf(actor);
  const rows = listAssessments(scope, 60);
  const st = engineStats(scope);
  const live = jevEnabled();
  const tiles = [
    { label: "OpenRouter calls", value: String(st.ai_runs ?? 0) },
    { label: "Avg JEV latency", value: st.avg_latency_ms != null ? `${Math.round(st.avg_latency_ms)} ms` : "—" },
    { label: "Tokens", value: (st.tokens ?? 0).toLocaleString("en-IE") },
    { label: "Model spend", value: `$${(st.cost_usd ?? 0).toFixed(4)}` },
    { label: "Avg card decision", value: st.avg_decision_ms != null ? `${st.avg_decision_ms.toFixed(1)} ms` : "—" },
    { label: "Fell back to rules", value: String(st.fallbacks ?? 0) },
  ];

  return (
    <>
      <AutoRefresh active ms={5000} />
      <PageHeader eyebrow="Behind the scenes" title="Risk engine">
        Two layers. Hard rules decide at the card in milliseconds. Then JEV, a decision model called through OpenRouter, scores each purchase against the
        society&rsquo;s history and returns a structured verdict. JEV can raise a review, never approve one.
      </PageHeader>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Status ok={live} name="JEV via OpenRouter" value={live ? `${env.jevModel} · ${env.openRouterBaseUrl.replace(/^https?:\/\//, "").replace(/\/v1\/?$/, "")}/alpha/decisions` : "No OPENROUTER_API_KEY: rules only"} />
        <Status ok={stripeEnabled()} name="Stripe" value={stripeEnabled() ? `Sandbox · Issuing ${env.issuingMode === "stripe" ? "live" : "simulated"}` : "Simulated checkout"} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
            <div className="text-[12px] text-ink-3">{t.label}</div>
            <div className="display mt-1 text-2xl tabular">{t.value}</div>
          </div>
        ))}
      </div>

      {!live && (
        <div className="mb-6">
          <Notice tone="warn" title="JEV is offline">
            Add <code>OPENROUTER_API_KEY</code> to <code>.env</code> and restart. Purchases still get a rules-only result.
          </Notice>
        </div>
      )}

      <Panel pad={false}>
        <div className="flex items-baseline justify-between p-5 pb-3">
          <SectionTitle>Recent assessments</SectionTitle>
          {isAdmin(actor) && (
            <Link href="/eval" className="text-sm text-ink-3 hover:text-ink">
              Evaluation →
            </Link>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-2.5 font-medium">Purchase</th>
                <th className="px-3 py-2.5 font-medium">Card</th>
                <th className="px-3 py-2.5 text-right font-medium">Rules</th>
                <th className="px-3 py-2.5 font-medium">JEV</th>
                <th className="px-3 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 text-right font-medium">Latency</th>
                <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                <th className="px-5 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-paper-2/60">
                  <td className="px-5 py-2.5">
                    <Link href={`/engine/${r.authorization_id}`} className="font-medium text-ink hover:underline">
                      {prettyMerchant(r.merchant_name)} · {fmtEur(r.amount_cents)}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {fmtDateTime(r.created_at)} · MCC {r.mcc}
                      {isAdmin(actor) && ` · ${r.society_name.replace(/^UCD /, "")}`}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cx("text-xs font-medium", r.decision === "declined" ? "text-bad" : "text-ok")}>{r.decision}</span>
                    <div className="text-xs text-ink-3 tabular">{r.decision_ms.toFixed(1)} ms</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{r.rules_score}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <RiskBadge level={r.risk_level} compact />
                      {r.risk_score != null && <span className="tabular text-xs text-ink-3">{r.risk_score}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.source === "jev" ? (
                      <span className="text-ink-2">{r.model?.split("/").pop()}</span>
                    ) : (
                      <Pill className="bg-paper-2 text-ink-3">{r.auth_source === "seed" ? "seeded · rules" : "rules fallback"}</Pill>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{r.latency_ms != null && r.source === "jev" ? `${r.latency_ms} ms` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular text-ink-2">{r.source === "jev" ? `${r.tokens_in ?? "?"}→${r.tokens_out ?? "?"}` : "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular text-ink-2">{r.cost_usd != null ? `$${r.cost_usd.toFixed(5)}` : "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-ink-3">
                    No assessments yet. Fire a purchase in the simulator.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Status({ ok, name, value }: { ok: boolean; name: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      {name.startsWith("JEV") ? (
        <Image src="/art/jev.webp" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-2 text-ink-2">
          <CreditCard className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} aria-hidden />
          {name}
        </div>
        <div className="truncate text-xs text-ink-3">{value}</div>
      </div>
    </div>
  );
}
