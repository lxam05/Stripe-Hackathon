import Link from "next/link";
import { requireActor } from "@/lib/guard";
import { reportOwner } from "@/lib/access";
import { listReports,type Evidence } from "@/lib/workflows";
import { fmtEur } from "@/lib/money";
import { PageHeader,Panel,SectionTitle,Notice,Pill,StatTile } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-form";
export default async function ReportsPage() {
  const a=await requireActor(),reports=listReports(a),owner=a.kind === "member" ? reportOwner(a.societyId) : null;
  const canDraft=owner?.id === a.id;
  const year=new Date().getUTCFullYear()-(new Date().getUTCMonth()<8 ? 2 : 1);
  return <><PageHeader title={a.kind === "admin" ? "Council grant reviews" : "Annual grant report"} eyebrow={a.kind === "member" ? a.societyName : "Societies Council"}>Review the previous academic year, explain spending and propose next year’s grant. Council records its interview notes and decision; approval does not add money to the ledger.</PageHeader>
    {owner && <Notice title={`Reporting owner: ${owner.name}`}>{owner.role === "senior_treasurer" ? "The senior treasurer prepares and submits the report." : "No senior treasurer is assigned, so the treasurer handles reporting."}</Notice>}
    {canDraft && <Panel className="my-6"><SectionTitle>Start a report</SectionTitle><WorkflowForm resource="report-draft" actions={[{value:"draft",label:"Draft from spending evidence"}]} fields={[{name:"year",label:"Academic year starts in September of",type:"number",value:year,required:true,hint:"An editable AI narrative when configured, otherwise a clearly labelled template. One report per year."}]}/></Panel>}
    {!reports.length && <Panel className="mt-6">{a.kind === "admin" ? "No reports have been submitted to Council yet." : "No annual reports yet."}</Panel>}
    <div className="mt-6 space-y-6">{reports.map(r=>{const e=JSON.parse(r.evidence) as Evidence;return <Panel key={r.id}>
      <div className="flex flex-wrap justify-between gap-2"><h2 className="display text-2xl">{r.society_name} · {r.year}/{r.year+1}</h2><Pill className="bg-paper-2">{r.status}</Pill></div>
      <p className="mt-2 text-xs text-ink-3">{r.draft_source}. Totals below are deterministic ledger evidence, not model calculations.</p>
      <div className="my-4 grid gap-3 sm:grid-cols-3"><StatTile label="Recorded net spending" cents={e.spent}/><StatTile label="Reimbursed" cents={e.reimbursements} hint="Included in recorded spending"/><StatTile label="Outstanding claims" cents={e.outstanding} hint="Not counted as paid spending"/></div>
      <p className="text-sm text-ink-2">Previous year: {e.previousCount ? fmtEur(e.previousSpent) : "No recorded evidence"}. Current outstanding card holds: {fmtEur(e.held)} (not annual spending).</p>
      <details className="my-4 rounded-xl bg-paper-2 p-4"><summary className="cursor-pointer font-medium">Spending evidence and breakdowns</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><div><SectionTitle>Categories</SectionTitle>{e.categories.map(c=><p key={c.name} className="text-sm">{c.name}: {fmtEur(c.cents)}</p>)}</div><div><SectionTitle>Events / cost centres</SectionTitle>{e.events.map(c=><p key={c.name} className="text-sm">{c.name}: {fmtEur(c.cents)}</p>)}</div></div><ul className="mt-4 max-h-64 overflow-auto divide-y divide-line">{e.entries.map(x=><li key={x.id} className="py-2 text-xs">Ledger #{x.id} · {x.created_at.slice(0,10)} · {x.memo} · {x.type === "refund" ? "−" : ""}{fmtEur(x.amount_cents)} {x.ref_type === "authorization" && <Link className="underline" href={`/transactions/${x.ref_id}`}>Payment evidence</Link>}{x.ref_type === "expense" && <Link className="underline" href={`/api/expenses/${x.ref_id}/receipt`}>Receipt evidence</Link>}</li>)}</ul></details>
      {canDraft && ["draft","returned"].includes(r.status) ? <WorkflowForm resource="reports" id={r.id} fields={[{name:"narrative",label:"Editable narrative and rationale",type:"textarea",value:r.narrative,required:true},{name:"estimate",label:"Requested next-year grant (€)",type:"number",value:(r.estimate_cents/100).toFixed(2),required:true,hint:"Starting estimate = recorded spending plus outstanding claims. Adjust for plans and other income."}]} actions={[{value:"save",label:"Save draft"},{value:"submit",label:"Submit to Council"}]}/> : <><p className="my-3 whitespace-pre-wrap text-sm leading-relaxed">{r.narrative}</p><p className="font-medium">Requested: {fmtEur(r.estimate_cents)}</p></>}
      {r.council_notes && <div className="my-4 rounded-xl bg-mint/30 p-4"><SectionTitle>Council feedback & interview notes</SectionTitle><p className="whitespace-pre-wrap text-sm">{r.council_notes}</p></div>}
      {r.approved_cents !== null && <Notice tone="ok" title={`Grant approved: ${fmtEur(r.approved_cents)}`}>Decision recorded only. Funding must be received separately.</Notice>}
      {a.kind === "admin" && r.status === "submitted" && <div className="mt-5"><WorkflowForm resource="reports" id={r.id} fields={[{name:"notes",label:"Council comments / interview notes",type:"textarea",required:true},{name:"approved",label:"Approved grant (€)",type:"number",value:(r.estimate_cents/100).toFixed(2)}]} actions={[{value:"comment",label:"Save interview notes"},{value:"return",label:"Return for revision"},{value:"approve",label:"Approve grant amount"}]}/></div>}
    </Panel>})}</div>
  </>;
}
