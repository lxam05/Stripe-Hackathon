import Link from "next/link";
import { Search } from "lucide-react";
import { TxnList } from "@/components/txn-list";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader, Panel, cx } from "@/components/ui";
import { requireActor } from "@/lib/guard";
import { isOfficer, scopeOf } from "@/lib/access";
import { listTransactions } from "@/lib/queries";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const flagged = sp.view === "flagged";
  const officer = isOfficer(actor);
  const rows = listTransactions({
    ...scopeOf(actor),
    q: q || undefined,
    flaggedOnly: flagged,
    limit: 200,
  });
  const tab = (active: boolean) => cx("rounded-full px-3.5 py-1.5 text-sm", active ? "bg-stone text-white" : "text-ink-2 hover:bg-paper-2");

  return (
    <>
      <AutoRefresh active={rows.some((r) => r.ra_status === "pending")} />
      <PageHeader eyebrow={actor.kind === "member" ? actor.societyName : "All societies"} title={officer ? "My purchases" : "Transactions"}>
        {officer ? "Every purchase on your card" : "Every authorisation"}, approved or declined, with its real-time decision and JEV&rsquo;s assessment.
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-full border border-line bg-surface p-1">
          <Link href={`/transactions${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={tab(!flagged)}>
            All
          </Link>
          <Link href={`/transactions?view=flagged${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={tab(flagged)}>
            Flagged
          </Link>
        </div>
        <form className="relative w-full sm:w-72" action="/transactions">
          {flagged && <input type="hidden" name="view" value="flagged" />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Merchant, event or MCC"
            className="w-full rounded-full border border-line-strong bg-white py-2 pl-9 pr-3 text-sm focus:border-stone-2 focus:outline-none focus:ring-2 focus:ring-mint"
            aria-label="Search transactions"
          />
        </form>
      </div>
      <Panel pad={false}>
        <TxnList rows={rows} showSociety={actor.kind === "admin"} empty={q ? `Nothing matches “${q}”.` : "No purchases yet."} />
      </Panel>
      {rows.length === 200 && <p className="mt-3 text-center text-xs text-ink-3">Showing the 200 most recent. Search to narrow down.</p>}
    </>
  );
}
