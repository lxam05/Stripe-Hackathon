import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { listExpenses } from "@/lib/workflows";
import { listEvents } from "@/lib/queries";
import { fmtEur,fmtDate } from "@/lib/money";
import { PageHeader,Panel,SectionTitle,Notice,Pill,StatTile } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-form";
export default async function ExpensesPage() {
  const a=await requireMember(),expenses=listExpenses(a),manage=a.role === "treasurer";
  const pending=expenses.filter(e=>["submitted","approved"].includes(e.status));
  return <>
    <PageHeader eyebrow={a.societyName} title="Member expenses">Paid out of pocket? Any member can claim costs, attach a receipt and see when they have been repaid.</PageHeader>
    <div className="grid gap-3 sm:grid-cols-2 mb-6"><StatTile label="Awaiting reimbursement" cents={pending.reduce((s,e)=>s+e.amount_cents,0)} hint="Submitted and approved claims; not yet debited from the ledger"/><StatTile label="Repaid to members" cents={expenses.filter(e=>e.status === "paid").reduce((s,e)=>s+e.amount_cents,0)}/></div>
    <Panel className="mb-6"><SectionTitle>Submit an expense</SectionTitle><WorkflowForm resource="expenses" multipart actions={[{value:"submit",label:"Submit claim"}]} fields={[
      {name:"merchant",label:"Merchant",required:true},{name:"amount",label:"Amount (€)",type:"number",required:true},{name:"incurredOn",label:"Date paid",type:"date",value:new Date().toISOString().slice(0,10),required:true},
      {name:"category",label:"Category",type:"select",options:["food","travel","equipment","venue","other"].map(value=>({value,label:value}))},
      {name:"eventId",label:"Event (optional)",type:"select",options:[{value:"",label:"General society spending"},...listEvents(a.societyId).map(e=>({value:e.id,label:e.name}))]},
      {name:"receipt",label:"Receipt (PDF, PNG or JPEG, up to 5 MB)",type:"file",required:true},{name:"purpose",label:"Purpose and any emergency context",type:"textarea",required:true}
    ]}/></Panel>
    <SectionTitle>{manage ? "Society claims" : a.role === "senior_treasurer" ? "Society oversight" : "Your claims"}</SectionTitle>
    {!expenses.length && <Notice>No claims yet.</Notice>}
    <div className="space-y-4">{expenses.map(e=><Panel key={e.id}>
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">{e.merchant} · {fmtEur(e.amount_cents)}</h2><Pill className="bg-paper-2">{e.status === "approved" ? "Approved · awaiting repayment" : e.status}</Pill></div>
      <p className="text-sm text-ink-3">{e.member_name} · {fmtDate(e.incurred_on)} · {e.category}</p><p className="my-3 text-sm">{e.purpose}</p>
      <Link className="text-sm underline" href={`/api/expenses/${e.id}/receipt`}>Download receipt: {e.receipt_name}</Link>
      {e.note && <p className="mt-3 text-sm">Treasurer note: {e.note}</p>}{e.paid_at && <p className="mt-3 text-sm text-ok">Repaid externally on {fmtDate(e.paid_at)} · {e.payment_reference}</p>}
      {manage && ["submitted","approved"].includes(e.status) && <div className="mt-4 border-t border-line pt-4"><Notice>Recording repayment does not send money. Pay externally first, then record the reference. The ledger is debited once.</Notice><div className="mt-3"><WorkflowForm resource="expense-review" id={e.id} fields={[{name:"note",label:"Review / repayment note",type:"textarea"},...(e.status === "approved" ? [{name:"paymentReference",label:"External payment reference",required:true}] : [])]} actions={e.status === "approved" ? [{value:"paid",label:"Mark repaid externally"}] : [{value:"approve",label:"Approve claim"},{value:"decline",label:"Decline claim"}]}/></div></div>}
    </Panel>)}</div>
  </>;
}
