import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CircleCheck, OctagonX } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { RunEvalButton } from "@/components/run-eval";
import { Notice, PageHeader, Panel, Pill, SectionTitle, cx } from "@/components/ui";
import { env, jevEnabled } from "@/lib/env";
import { computeEval, evalProgress, type Metrics } from "@/lib/evaluation";
import { requireActor } from "@/lib/guard";
import { fmtDate, fmtEur } from "@/lib/money";

export const metadata = { title: "Evaluation" };

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function readTests() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve("data/test-results.json"), "utf8")) as {
      ran_at: string;
      passed: number;
      total: number;
      results: { id: string; kind: string; name: string; expected: string; actual: string; pass: boolean }[];
    };
  } catch {
    return null;
  }
}

export default async function EvalPage() {
  const actor=await requireActor();
  if(actor.kind !== "admin") redirect("/dashboard");
  const e = computeEval();
  const samples = e.samples;
  const progress = evalProgress();
  const tests = readTests();
  const rows: (Metrics | null)[] = [e.rules, e.jev, e.combined];

  return (
    <>
      <AutoRefresh active={progress.running} ms={2500} />
      <PageHeader eyebrow="Stay curious" title="Does JEV add value over rules?">
        We ran the labelled evaluation set ({e.set.n} purchases: {e.set.anomalies} seeded anomalies, {e.set.hardNegatives} unusual-but-legitimate hard
        negatives) through three configurations. A purchase counts as caught if it&rsquo;s declined or sent to the review queue.
      </PageHeader>

      <Panel pad={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-3 font-medium">Configuration</th>
                <th className="px-3 py-3 text-right font-medium">Precision</th>
                <th className="px-3 py-3 text-right font-medium">Recall</th>
                <th className="px-3 py-3 text-right font-medium">F1</th>
                <th className="px-3 py-3 text-right font-medium">False flags / society / month</th>
                <th className="px-3 py-3 text-right font-medium">p95 latency</th>
                <th className="px-5 py-3 text-right font-medium">Cost / 100</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m, i) => (
                <tr key={i} className={cx(i === 2 && "bg-mint/25")}>
                  <td className="px-5 py-3 font-medium">
                    {m?.config ?? (i === 1 ? "JEV only" : "Combined (shipped policy)")}
                    {m && <span className="ml-2 text-xs font-normal text-ink-3">n={m.n} · TP {m.tp} · FP {m.fp} · FN {m.fn}</span>}
                  </td>
                  {m ? (
                    <>
                      <td className="px-3 py-3 text-right tabular">{pct(m.precision)}</td>
                      <td className="px-3 py-3 text-right tabular">{pct(m.recall)}</td>
                      <td className="px-3 py-3 text-right tabular">{m.f1 == null ? "—" : m.f1.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right tabular">{m.falseFlagsPerSocietyMonth == null ? "—" : m.falseFlagsPerSocietyMonth.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right tabular">{m.p95LatencyMs == null ? "—" : m.p95LatencyMs < 50 ? `${m.p95LatencyMs.toFixed(1)} ms` : `${(m.p95LatencyMs / 1000).toFixed(1)} s`}</td>
                      <td className="px-5 py-3 text-right tabular">{m.costPer100Usd == null ? "—" : m.costPer100Usd === 0 ? "€0" : `$${m.costPer100Usd.toFixed(3)}`}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 py-3 text-ink-3">
                      Not run yet. {jevEnabled() ? "Start a run below." : "Needs OPENROUTER_API_KEY."}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-3">
            {e.run
              ? `Last JEV run: ${e.run.model} · ${fmtDate(e.run.started)} · ${e.run.n} calls${e.failures ? ` · ${e.failures} fell back to rules` : ""}.`
              : "Rules-only numbers come from the real decision engine replaying the year."}{" "}
            False-flag rate is scaled from the 30% sample to the full year.
          </p>
          {jevEnabled() && <RunEvalButton running={progress.running} done={progress.done} total={progress.total} model={env.jevModel} />}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel pad={false}>
          <div className="px-5 pt-5">
            <SectionTitle>Caught, by anomaly type</SectionTitle>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-2 font-medium">Type</th>
                <th className="px-2 py-2 text-right font-medium">n</th>
                <th className="px-2 py-2 text-right font-medium">Rules</th>
                <th className="px-2 py-2 text-right font-medium">JEV</th>
                <th className="px-5 py-2 text-right font-medium">Combined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {e.byType.map(([type, t]) => {
                const legit = type.includes("legit");
                const cell = (v: number) => (
                  <span className={cx("tabular", legit ? (v > 0 ? "text-warn" : "text-ok") : v === t.n ? "text-ok" : v === 0 ? "text-bad" : "")}>
                    {v}/{t.n}
                  </span>
                );
                return (
                  <tr key={type}>
                    <td className="px-5 py-2">
                      {type.replace(/_/g, " ")}
                      {legit && <span className="ml-1 text-xs text-ink-3">(lower is better)</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular text-ink-3">{t.n}</td>
                    <td className="px-2 py-2 text-right">{cell(t.rules)}</td>
                    <td className="px-2 py-2 text-right">{e.jev ? cell(t.jev) : "—"}</td>
                    <td className="px-5 py-2 text-right">{e.jev ? cell(t.combined) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <SectionTitle>What we learned</SectionTitle>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-2">
              <li>
                <b className="text-ink">Rules are precise but blind to context.</b> Blocked categories, budget overruns and after-event spend are caught
                every time, deterministically, in under a millisecond. Split purchases, duplicates and personal buys at &ldquo;normal&rdquo; merchants mostly
                score under the flag threshold.
              </li>
              <li>
                <b className="text-ink">{e.jev ? "JEV reads the event, not just the MCC." : "Hypothesis (not yet measured): JEV reads the event, not just the MCC."}</b> A Netflix charge on a
                navigation workshop card, or Boots on a pizza social, carries no single strong rule signal, but it plainly doesn&rsquo;t fit the event.
                {e.jev && e.combined && (
                  <>
                    {" "}
                    Measured: recall {pct(e.rules.recall)} → {pct(e.combined.recall)} combined, precision {pct(e.rules.precision)} → {pct(e.combined.precision)}.
                  </>
                )}
              </li>
              <li>
                <b className="text-ink">So we combine, asymmetrically.</b> AI can raise suspicion but never approve, and auto-freeze needs both layers to
                agree. That keeps the cost of an AI false positive (a frozen card mid-event) low.
              </li>
              <li>
                <b className="text-ink">Changed after testing:</b> prompt-injection text in a merchant descriptor wasn&rsquo;t flagged when the AI was down,
                so we added a deterministic rule (R13). Defence in depth beats trusting the model.
              </li>
            </ul>
          </Panel>
          {e.consistency && (
            <Panel>
              <SectionTitle>Consistency</SectionTitle>
              <p className="text-sm text-ink-2">
                {e.consistency.cases} purchases re-run 3× at temperature 0: mean score stdev <b className="tabular text-ink">{e.consistency.meanStdev.toFixed(1)}</b> points; same risk level{" "}
                <b className="tabular text-ink">{pct(e.consistency.levelAgreement)}</b> of the time.
              </p>
            </Panel>
          )}
        </div>
      </div>

      {samples.length > 0 && (
        <>
          <div className="mt-8">
            <SectionTitle>Sample explanations</SectionTitle>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {samples.map((s) => (
              <Link key={s.id} href={`/transactions/${s.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{s.merchant}</span>
                  <span className="tabular">{fmtEur(s.amount)}</span>
                </div>
                <div className="mt-1 flex gap-1.5">
                  <Pill className={s.truth ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}>Truth: {s.truth ? s.type?.replace(/_/g, " ") : "legit (hard negative)"}</Pill>
                  <Pill className="bg-paper-2 text-ink-2">JEV: {s.level}</Pill>
                </div>
                <p className="mt-2 text-[13px] text-ink-2">{s.summary}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel pad={false}>
          <div className="flex items-baseline justify-between px-5 pt-5">
            <SectionTitle>Test matrix (PRD §11.2)</SectionTitle>
            {tests && (
              <span className="text-sm text-ink-3">
                {tests.passed}/{tests.total} passed · <code className="text-xs">npm test</code>
              </span>
            )}
          </div>
          {!tests ? (
            <p className="px-5 pb-5 text-sm text-ink-3">
              Run <code>npm test</code> to execute the ordinary / boundary / failure cases.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {tests.results.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  {r.pass ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <OctagonX className="mt-0.5 h-4 w-4 shrink-0 text-bad" />}
                  <span className="w-10 shrink-0 font-mono text-xs leading-5 text-ink-3">{r.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{r.name}</span>
                    <span className="block text-xs text-ink-3">
                      expected {r.expected} · got {r.actual}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel>
            <div className="mb-3 flex items-center gap-3">
              <Image src="/art/jev.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
              <SectionTitle>JEV&rsquo;s known limits</SectionTitle>
            </div>
            <dl className="space-y-2.5 text-sm">
              {[
                ["Latency (seconds)", "Runs async; rules decide inside the auth window."],
                ["Non-determinism", "temperature 0, JSON schema, few-shot calibration; model + prompt version stored."],
                ["Hallucinated evidence", "Euro amounts and MCCs in each flag are checked against the input; unverified ones are labelled."],
                ["Prompt injection", "Descriptor wrapped as untrusted data; JEV has no tools; R13 flags it without AI."],
                ["Privacy", "Members sent as pseudonyms, no PAN; providers that retain data are excluded."],
                ["Outages", "8 s timeout, one retry, rules-only fallback with a visible badge."],
                ["Synthetic data", "Labels and anomalies are ours; real-world precision is unknown until a pilot."],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-medium text-ink">{k}</dt>
                  <dd className="text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {!jevEnabled() && (
            <Notice tone="warn" title="JEV is offline on this machine">
              Add <code>OPENROUTER_API_KEY</code> to <code>.env</code> and restart to run the JEV and combined rows.
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}
