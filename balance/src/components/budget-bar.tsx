import { fmtEur } from "@/lib/money";
import { cx } from "./ui";

/** Spent (solid) / held (striped) / remaining meter. Identity never relies on colour alone. */
export function BudgetBar({
  budget,
  spent,
  held,
  showLegend = true,
  thin,
}: {
  budget: number;
  spent: number;
  held: number;
  showLegend?: boolean;
  thin?: boolean;
}) {
  const pct = (v: number) => (budget > 0 ? Math.min(100, Math.max(0, (v / budget) * 100)) : 0);
  const remaining = budget - spent - held;
  const over = remaining < 0;
  return (
    <div>
      <div
        className={cx("flex w-full gap-[2px] overflow-hidden rounded-full bg-paper-2", thin ? "h-2" : "h-3")}
        role="img"
        aria-label={`${fmtEur(spent)} spent, ${fmtEur(held)} held, ${fmtEur(Math.max(0, remaining))} remaining of ${fmtEur(budget)}`}
      >
        {spent > 0 && <div className="h-full rounded-l-full bg-[var(--viz-spent)]" style={{ width: `${pct(spent)}%` }} />}
        {held > 0 && <div className={cx("held-texture h-full", spent === 0 && "rounded-l-full")} style={{ width: `${pct(held)}%` }} />}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--viz-spent)]" /> Spent <b className="tabular font-medium text-ink">{fmtEur(spent)}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="held-texture inline-block h-2 w-2 rounded-full" /> Held <b className="tabular font-medium text-ink">{fmtEur(held)}</b>
          </span>
          <span className={cx("inline-flex items-center gap-1.5", over && "text-bad")}>
            <span className="inline-block h-2 w-2 rounded-full border border-line-strong bg-paper-2" /> Remaining{" "}
            <b className="tabular font-medium">{fmtEur(remaining)}</b>
          </span>
          <span className="ml-auto text-ink-3">of {fmtEur(budget)}</span>
        </div>
      )}
    </div>
  );
}
