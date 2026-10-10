import Link from "next/link";
import { requireActor } from "@/lib/guard";
import { listMandates,listReviews } from "@/lib/workflows";
import { fmtEur,fmtDate } from "@/lib/money";
import { PageHeader,Panel,SectionTitle,Pill } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { listFlags } from "@/lib/queries";
import { isOfficer, scopeOf } from "@/lib/access";
import { plainText } from "@/lib/explain";
export default async function ReviewPage() {
  const a=await requireActor(),reviews=listReviews(a),manage=a.kind === "member" && a.role === "treasurer";
  const open=reviews.filter(r=>["pending","receipt_requested"].includes(r.status));
  const year=new Date().getUTCMonth()>=8 ? new Date().getUTCFullYear()+1 : new Date().getUTCFullYear();
  // Officers only see risk investigations on their own card.
  const incidents=listFlags({...scopeOf(a),status:"open"});
  return <><AutoRefresh active ms={10000}/><PageHeader title={isOfficer(a) ? "My payment reviews" : "Payment reviews"} eyebrow={a.kind === "member" ? a.societyName : "Societies Council"}>{isOfficer(a) ? "Purchases of yours the treasurer is checking. Nothing for you to do unless they ask." : "Payments that went through but look new or unusual. Approve the expected ones; recurring payments you approve are handled automatically."}</PageHeader>
    {incidents.length>0 && <Panel className="mt-4"><SectionTitle>Flagged as risky</SectionTitle><p className="mb-2 text-sm text-ink-2">Includes blocked attempts and frozen cards.</p><ul className="space-y-2">{incidents.slice(0,8).map(f=><li key={f.id} className="text-sm"><Link className="underline" href={`/transactions/${f.id}`}>{f.merchant_name} · {fmtEur(f.amount_cents)}</Link></li>)}</ul></Panel>}
    <div className="mt-6"><SectionTitle aside={`${open.length} to review`}>Needs attention</SectionTitle></div>
    {!open.length && <Panel><p>No payments need your review.</p></Panel>}
    <div className="space-y-4">{open.map(r=><Panel key={r.authorization_id}>
      <div className="flex flex-wrap justify-between gap-2"><Link href={`/transactions/${r.authorization_id}`} className="text-lg font-semibold underline decoration-line underline-offset-4">{r.merchant_name} · {fmtEur(r.amount_cents)}</Link><Pill className="bg-warn-bg text-warn">{r.status.replaceAll("_"," ")}</Pill></div>
      <p className="mt-1 text-sm text-ink-3">{r.member_name} · {fmtDate(r.created_at)}{a.kind === "admin" ? ` · ${r.society_name}` : ""}</p><p className="my-3 text-sm">{plainText(r.reason) || "First payment to this shop."}</p>
      {manage && <WorkflowForm resource="reviews" id={r.authorization_id} fields={[
        {name:"note",label:"Decision note / receipt request / recovery follow-up",type:"textarea"},
        {name:"recurring",label:"Also approve future recurring payments (only with Approve spending)",type:"checkbox"},
        {name:"min",label:"Recurring minimum (€)",type:"number",value:(Math.floor(r.amount_cents*0.9)/100).toFixed(2)},
        {name:"max",label:"Recurring maximum (€)",type:"number",value:(Math.ceil(r.amount_cents*1.1)/100).toFixed(2)},
        {name:"cadence",label:"Cadence",type:"select",value:"monthly",options:["weekly","monthly","yearly"].map(value=>({value,label:value}))},
        {name:"endsOn",label:"Approval ends",type:"date",value:`${year}-08-31`,hint:"Scoped to this cardholder, merchant identity and EUR. Exceptions still return here."}
      ]} actions={[{value:"approved",label:"Approve spending"},{value:"receipt_requested",label:"Request receipt"},{value:"misuse",label:"Mark misuse"}]}/>}
    </Panel>)}</div>
    {a.kind === "member" && ["treasurer","senior_treasurer"].includes(a.role) && <div className="mt-8"><SectionTitle>Recurring approvals</SectionTitle><div className="space-y-3">{listMandates(a.societyId).map(m=><Panel key={m.id}><h3 className="font-semibold">{m.merchant_name}</h3><p className="my-2 text-sm">{fmtEur(m.min_cents)}–{fmtEur(m.max_cents)} · {m.cadence} · until {fmtDate(m.ends_at)} · {m.status}</p>{manage && m.status === "active" && <WorkflowForm resource="mandates" id={m.id} actions={[{value:"revoke",label:"Revoke future approval"}]}/>}</Panel>)}</div></div>}
    <div className="mt-8"><SectionTitle>Recent decisions</SectionTitle><Panel><ul className="divide-y divide-line">{reviews.filter(r=>["approved","misuse"].includes(r.status)).slice(0,30).map(r=><li key={r.authorization_id} className="py-3 text-sm"><Link href={`/transactions/${r.authorization_id}`}>{r.merchant_name} · {fmtEur(r.amount_cents)}</Link><span className="ml-2 text-ink-3">{r.status.replaceAll("_"," ")}</span>{r.note && <p>{r.note}</p>}</li>)}</ul></Panel></div>
  </>;
}
