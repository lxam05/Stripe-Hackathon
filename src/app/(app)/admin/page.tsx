import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkflowForm } from "@/components/workflow-form";
import { listMembers } from "@/lib/queries";
import { CircleCheck, OctagonX } from "lucide-react";
import { PolicyEditor } from "@/components/policy-editor";
import { ResetDemo } from "@/components/reset-demo";
import { PageHeader, Panel, Pill, SectionTitle, StatTile } from "@/components/ui";
import { getDb } from "@/lib/db";
import { requireActor } from "@/lib/guard";
import { reconcileAll } from "@/lib/ledger";
import { MCC_TABLE } from "@/lib/mcc";
import { fmtDate, fmtEur, relativeTime } from "@/lib/money";
import { listPolicies } from "@/lib/policy";
import { listAudit, listSocieties, societyOverview } from "@/lib/queries";

export const metadata = { title: "Societies Office" };

export default async function AdminPage() {
  const actor = await requireActor();
  if (actor.kind !== "admin") redirect("/dashboard");
  const socs = listSocieties();
  const rec = new Map(reconcileAll().map((r) => [r.id, r]));
  const flagCounts = getDb()
    .prepare(
      `SELECT a.society_id, f.severity, COUNT(*) n FROM flag f JOIN authorization a ON a.id=f.authorization_id WHERE f.status IN ('open','receipt_requested') GROUP BY 1,2`,
    )
    .all() as { society_id: string; severity: string; n: number }[];
  const overview = socs.map((s) => ({ ...s, o: societyOverview(s.id), r: rec.get(s.id)! }));
  const totals = overview.reduce((t, s) => ({ available: t.available + s.o.available, held: t.held + s.o.held, spent: t.spent + s.o.termSpent }), { available: 0, held: 0, spent: 0 });
  const policies = listPolicies("global").map((p) => ({ mcc: p.mcc, action: p.action, preapproved: JSON.parse(p.event_types_preapproved) as string[] }));
  const audit = listAudit(14);

  return (
    <>
      <PageHeader eyebrow="Societies Council" title="All societies">
        Create societies and assign their treasurer and optional senior treasurer. Review spending reports and record grant interview decisions.
      </PageHeader>

      <Panel className="mb-6"><SectionTitle>Create a society</SectionTitle><WorkflowForm resource="societies" actions={[{value:"create",label:"Create society and assign roles"}]} fields={[{name:"name",label:"Society name",required:true},{name:"slug",label:"URL slug (lowercase letters and hyphens)",required:true},{name:"treasurerName",label:"Treasurer name (required)",required:true},{name:"treasurerEmail",label:"Treasurer email",type:"email",required:true},{name:"seniorName",label:"Senior treasurer name (optional)"},{name:"seniorEmail",label:"Senior treasurer email (optional)",type:"email"}]}/><Link href="/reports" className="mt-4 block text-sm underline">Open Council grant reviews →</Link></Panel>
      <details className="mb-6 rounded-2xl border border-line p-5"><summary className="cursor-pointer font-medium">Manage reporting roles</summary><div className="mt-4 space-y-5">{socs.map(s=>{const m=listMembers(s.id);const options=m.map(x=>({value:x.id,label:x.name}));return <Panel key={s.id}><SectionTitle>{s.name}</SectionTitle><WorkflowForm resource="leadership" id={s.id} fields={[{name:"treasurerId",label:"Treasurer (required)",type:"select",value:m.find(x=>x.role === "treasurer")?.id,options,required:true},{name:"seniorId",label:"Senior treasurer",type:"select",value:m.find(x=>x.role === "senior_treasurer")?.id ?? "",options:[{value:"",label:"None · treasurer takes over"},...options]}]}/></Panel>})}</div></details>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Available across societies" cents={totals.available} />
        <StatTile label="Held" cents={totals.held} tone="held" />
        <StatTile label="Spent this term" cents={totals.spent} tone="spent" hint="Since 1 Sept 2026" />
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
          <div className="text-[13px] text-ink-2">Ledger reconciliation</div>
          <div className="mt-2 flex items-center gap-2">
            {[...rec.values()].every((r) => r.ok) ? (
              <>
                <CircleCheck className="h-7 w-7 text-ok" />
                <span className="display text-3xl">All balanced</span>
              </>
            ) : (
              <>
                <OctagonX className="h-7 w-7 text-bad" />
                <span className="display text-3xl text-bad">Mismatch</span>
              </>
            )}
          </div>
          <div className="mt-1 text-xs text-ink-3">Holds match pending authorisations; nothing negative.</div>
        </div>
      </div>

      <Panel pad={false} className="mt-8">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
                <th className="px-5 py-3 font-medium">Society</th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 text-right font-medium">Available</th>
                <th className="px-3 py-3 text-right font-medium">Held</th>
                <th className="px-3 py-3 text-right font-medium">Spent this term</th>
                <th className="px-5 py-3 font-medium">Open flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {overview.map((s) => {
                const fc = flagCounts.filter((f) => f.society_id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Image src={s.icon} alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
                        <span className="font-medium">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {s.plan_status === "active" ? (
                        <Pill className="bg-ok-bg text-ok">Active to {fmtDate(s.plan_renews_at!)}</Pill>
                      ) : (
                        <Pill className="bg-warn-bg text-warn">Expired</Pill>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{fmtEur(s.o.available)}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtEur(s.o.held)}</td>
                    <td className="px-3 py-3 text-right tabular">{fmtEur(s.o.termSpent)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        {fc.length === 0 && <span className="text-ink-3">None</span>}
                        {(["high", "medium", "low"] as const).map((sev) => {
                          const n = fc.find((f) => f.severity === sev)?.n;
                          return n ? (
                            <Pill key={sev} className={sev === "high" ? "bg-bad-bg text-bad" : sev === "medium" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"}>
                              {n} {sev}
                            </Pill>
                          ) : null;
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0">
          <SectionTitle aside="UCD-wide · applies to every society">Merchant category policy</SectionTitle>
          <PolicyEditor
            policies={policies}
            mccs={MCC_TABLE.map((m) => ({ code: m.code, label: m.label, defaultPolicy: m.defaultPolicy }))}
            editable={actor.kind === "admin"}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <Panel pad={false}>
            <div className="px-5 pt-5">
              <SectionTitle>Audit log</SectionTitle>
            </div>
            <ul className="divide-y divide-line text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2">
                  <span className="w-32 shrink-0 font-mono text-xs text-ink-2">{a.action}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                    {a.actor} → {a.target}
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{relativeTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <SectionTitle>Demo data</SectionTitle>
            <p className="mb-3 text-sm text-ink-2">Regenerate the synthetic year (fixed seed). Everything you&rsquo;ve done in the demo is discarded.</p>
            <ResetDemo />
          </Panel>
        </div>
      </div>
    </>
  );
}
