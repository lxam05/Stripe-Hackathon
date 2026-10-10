import clsx from "clsx";
import Image from "next/image";
import type { ReactNode } from "react";
import { CircleCheck, Info, OctagonX, Snowflake, TriangleAlert, Ban, LoaderCircle } from "lucide-react";
import { fmtEur } from "@/lib/money";

export const cx = clsx;

export function Panel({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]", pad && "p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-ink-3">{eyebrow}</p>}
        <h1 className="display text-4xl leading-[1.05] text-ink sm:text-5xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-[15px] text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">{children}</h2>
      {aside && <div className="text-sm text-ink-3">{aside}</div>}
    </div>
  );
}

export const btn = {
  base: "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
  primary: "bg-stone px-4 py-2.5 text-white hover:bg-stone-2",
  secondary: "border border-line-strong bg-surface px-4 py-2.5 text-ink hover:bg-paper-2",
  ghost: "px-3 py-2 text-ink-2 hover:bg-paper-2 hover:text-ink",
  danger: "bg-bad px-4 py-2.5 text-white hover:bg-[#93201a]",
  coral: "bg-coral px-4 py-2.5 text-white hover:bg-[#cc6a50]",
};
export const button = (kind: keyof typeof btn = "primary", extra?: string) => cx(btn.base, btn[kind], extra);

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("tabular", className)}>{fmtEur(cents)}</span>;
}

export function StatTile({ label, cents, hint, tone, icon }: { label: string; cents: number; hint?: ReactNode; tone?: "held" | "spent" | "plain"; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        {tone === "held" && <span className="held-texture inline-block h-2.5 w-2.5 rounded-full" aria-hidden />}
        {tone === "spent" && <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--viz-spent)]" aria-hidden />}
        {icon}
        {label}
      </div>
      <div className="display mt-1 text-[2.1rem] leading-tight tabular text-ink">{fmtEur(cents)}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

type Level = "low" | "medium" | "high";
const LEVEL: Record<Level, { cls: string; label: string; Icon: typeof Info }> = {
  low: { cls: "bg-ok-bg text-ok", label: "Low risk", Icon: CircleCheck },
  medium: { cls: "bg-warn-bg text-warn", label: "Medium risk", Icon: TriangleAlert },
  high: { cls: "bg-bad-bg text-bad", label: "High risk", Icon: OctagonX },
};

export function RiskBadge({ level, compact }: { level: Level | null | undefined; compact?: boolean }) {
  if (!level) return <Pill className="bg-paper-2 text-ink-3">Not assessed</Pill>;
  const l = LEVEL[level];
  return (
    <Pill className={l.cls}>
      <l.Icon className="h-3.5 w-3.5" aria-hidden />
      {compact ? level[0].toUpperCase() + level.slice(1) : l.label}
    </Pill>
  );
}

export function SeverityBadge({ severity }: { severity: Level }) {
  const l = LEVEL[severity];
  return (
    <Pill className={l.cls}>
      <l.Icon className="h-3.5 w-3.5" aria-hidden />
      {severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low"} severity
    </Pill>
  );
}

export function DecisionBadge({ decision, status }: { decision: string; status?: string }) {
  if (decision === "declined")
    return (
      <Pill className="bg-bad-bg text-bad">
        <Ban className="h-3.5 w-3.5" aria-hidden /> Declined
      </Pill>
    );
  if (status === "reversed") return <Pill className="bg-paper-2 text-ink-2">Reversed</Pill>;
  if (status === "pending") return <Pill className="bg-warn-bg text-warn">Held</Pill>;
  return (
    <Pill className="bg-ok-bg text-ok">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Approved
    </Pill>
  );
}

export function CardStatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string, ReactNode]> = {
    active: ["bg-ok-bg text-ok", "Active", <CircleCheck key="i" className="h-3.5 w-3.5" />],
    inactive: ["bg-info-bg text-info", "Frozen", <Snowflake key="i" className="h-3.5 w-3.5" />],
    canceled: ["bg-bad-bg text-bad", "Cancelled", <Ban key="i" className="h-3.5 w-3.5" />],
    pending: ["bg-warn-bg text-warn", "Card pending", <LoaderCircle key="i" className="h-3.5 w-3.5" />],
  };
  const [cls, label, icon] = map[status] ?? map.pending;
  return (
    <Pill className={cls}>
      {icon}
      {label}
    </Pill>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium", className)}>{children}</span>;
}

export function AiLabel({ fallback }: { fallback?: boolean }) {
  return fallback ? (
    <Pill className="bg-paper-2 text-ink-2">Rules only</Pill>
  ) : (
    <Pill className="bg-mint/70 text-stone">
      <Image src="/art/jev.webp" alt="" width={14} height={14} className="rounded-full" /> JEV decision
    </Pill>
  );
}

export function EmptyState({ title, children, image = "/art/empty-clear.webp", action }: { title: string; children?: ReactNode; image?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {image === "/art/empty-clear.webp" ? (
        <Image src={image} alt="" width={260} height={195} className="mb-4 h-auto w-[220px] feather" />
      ) : (
        <Image src={image} alt="" width={128} height={128} className="mb-4 h-28 w-28 rounded-[28px] shadow-[var(--shadow-card)]" />
      )}
      <h3 className="display text-2xl text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const map = {
    info: ["bg-info-bg text-info", Info],
    warn: ["bg-warn-bg text-warn", TriangleAlert],
    bad: ["bg-bad-bg text-bad", OctagonX],
    ok: ["bg-ok-bg text-ok", CircleCheck],
  } as const;
  const [cls, Icon] = map[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl px-4 py-3 text-sm", cls)} role={tone === "bad" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-[13px] opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export const field =
  "w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 focus:border-stone-2 focus:outline-none focus:ring-2 focus:ring-mint";
export const label = "mb-1.5 block text-[13px] font-medium text-ink-2";
