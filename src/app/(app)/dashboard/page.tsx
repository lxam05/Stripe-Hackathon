import Link from "next/link";
import { requireMember } from "@/lib/guard";
import { reportOwner } from "@/lib/access";
import { listExpenses,listReviews,listReports } from "@/lib/workflows";
import { getSociety,listCards,listTransactions,monthlySpend } from "@/lib/queries";
import { societyBalances } from "@/lib/ledger";
import { cardCapacity } from "@/lib/cards";
import { PageHeader,Panel,SectionTitle,StatTile,Notice,button } from "@/components/ui";
import { SpendChart } from "@/components/spend-chart";
import { TxnList } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { fmtEur } from "@/lib/money";
export default async function Dashboard() {
  const a=await requireMember(),s=getSociety(a.societyId)!,b=societyBalances(s.id);
  const reviews=listReviews(a).filter(r=>["pending","receipt_requested"].includes(r.status));
  const claims=listExpenses(a).filter(e=>["submitted","approved"].includes(e.status));
  const owner=reportOwner(s.id),reports=listReports(a),cards=listCards({societyId:s.id});
  const txns=listTransactions({societyId:s.id,limit:8});
  return <><AutoRefresh active ms={10000}/><PageHeader eyebrow={s.name} title={`Hello, ${a.name.split(" ")[0]}.`} actions={<Link href="/expenses" className={button("primary")}>Submit an expense</Link>}>Society spending without leaving members out of pocket. Keep payment reviews, reimbursements and annual reporting in one place.</PageHeader>
    {s.plan_status !== "active" && <div className="mb-6"><Notice tone="warn" title="Committee cards are paused"><Link className="underline" href="/plan">Renew the €49/year Society Plan</Link>. Expenses and reporting remain available.</Notice></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatTile label="Available society funds" cents={b.available} hint="Funded minus held and spent"/><StatTile label="Awaiting reimbursement" cents={claims.reduce((sum,e)=>sum+e.amount_cents,0)} hint="Claims are not yet debited"/><StatTile label="Card holds" cents={b.held} hint="Authorised, not yet settled"/><StatTile label="Recorded net spending" cents={b.spent}/></div>
    <div className="my-6 grid gap-4 md:grid-cols-3">{[
      {href:"/review",title:"Payment reviews",value:`${reviews.length} need attention`,body:"First-time payments and exceptions. Recurring matches are recorded automatically."},
      {href:"/expenses",title:"Member expenses",value:`${claims.length} awaiting repayment`,body:"Receipt-backed claims and external repayment tracking."},
      {href:"/reports",title:"Annual grant report",value:reports[0] ? `${reports[0].year}/${reports[0].year+1} · ${reports[0].status}` : "Ready to draft",body:`Reporting owner: ${owner?.name ?? "Not assigned"}. Council reviews evidence and the next-year estimate.`}
    ].map(x=><Link key={x.href} href={x.href} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] hover:bg-paper-2"><SectionTitle>{x.title}</SectionTitle><p className="display text-2xl">{x.value}</p><p className="mt-2 text-sm text-ink-2">{x.body}</p></Link>)}</div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Panel><SectionTitle aside={<Link href="/review">Open reviews →</Link>}>Next to review</SectionTitle>{reviews.length ? <ul className="divide-y divide-line">{reviews.slice(0,5).map(r=><li key={r.authorization_id} className="py-3"><Link href={`/transactions/${r.authorization_id}`} className="font-medium">{r.merchant_name} · {fmtEur(r.amount_cents)}</Link><p className="mt-1 text-sm text-ink-3">{r.reason}</p></li>)}</ul> : <p className="text-sm text-ink-2">No payment reviews outstanding.</p>}</Panel>
    <Panel><SectionTitle>Committee cards</SectionTitle><p className="display text-3xl">{cards.length} / {cardCapacity(s.id)} slots</p><p className="my-3 text-sm text-ink-2">Cards stay with their committee member across events. Thresholds trigger review, not a decline.</p><Link href="/cards" className={button("secondary")}>View cards</Link><p className="mt-4 text-xs text-ink-3">€49/year includes five slots · €10 per extra slot for the remaining plan year.</p></Panel></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Panel pad={false}><div className="p-5"><SectionTitle>Recent card payments</SectionTitle></div><TxnList rows={txns}/></Panel><Panel><SectionTitle>Recorded monthly spending</SectionTitle><SpendChart data={monthlySpend(s.id)}/></Panel></div>
  </>;
}
