import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { env, jevEnabled, stripeEnabled } from "@/lib/env";
import { isFinance } from "@/lib/access";
import { listReviews } from "@/lib/workflows";
import { ROLE_LABEL } from "@/lib/roles";
import type { Actor } from "@/lib/session";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./nav-links";
import { SwitchUser } from "./switch-user";

export function AppShell({ actor, children }: { actor: Actor; children: ReactNode }) {
  const flags = listReviews(actor).filter(r => ["pending","receipt_requested"].includes(r.status)).length;
  const treasurer = actor.kind === "member" && actor.role === "treasurer";
  // Officers only get their own card, spending and reviews; money, members' spending and reporting are the finance roles'.
  const main: NavItem[] =
    actor.kind === "admin"
      ? [
          { href: "/admin", label: "Societies Council", icon: "admin" },
          { href: "/reports", label: "Grant reviews", icon: "admin" },
          { href: "/review", label: "Payment reviews", icon: "review", badge: flags },
          { href: "/transactions", label: "Transactions", icon: "transactions" },
        ]
      : isFinance(actor)
        ? [
            { href: "/dashboard", label: "Overview", icon: "dashboard" },
            { href: "/cards", label: "Officer cards", icon: "cards" },
            { href: "/expenses", label: "Expenses", icon: "transactions" },
            { href: "/reports", label: "Grant report", icon: "admin" },
            { href: "/members", label: "Members", icon: "admin" },
            { href: "/events", label: "Events · cost centres", icon: "events" },
            { href: "/review", label: "Payment reviews", icon: "review", badge: flags },
            { href: "/transactions", label: "Transactions", icon: "transactions" },
            { href: "/funding", label: "Funding", icon: "funding" },
            ...(treasurer ? [{ href: "/plan", label: "Plan", icon: "plan" } as NavItem] : []),
          ]
        : [
            { href: "/dashboard", label: "Overview", icon: "dashboard" },
            { href: "/cards", label: "My card", icon: "cards" },
            { href: "/expenses", label: "My expenses", icon: "transactions" },
            { href: "/events", label: "My events", icon: "events" },
            { href: "/review", label: "My payment reviews", icon: "review", badge: flags },
            { href: "/transactions", label: "My purchases", icon: "transactions" },
            { href: "/members", label: "Members", icon: "admin" },
          ];
  const demo: NavItem[] = [
    { href: "/simulator", label: "Purchase simulator", icon: "simulator" },
    ...(actor.kind === "admin" ? [{ href: "/eval", label: "Evaluation", icon: "eval" } as NavItem] : []),
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-paper/80 px-4 py-5 backdrop-blur lg:flex">
        <Link href={actor.kind === "admin" ? "/admin" : "/dashboard"} className="px-2">
          <Logo />
        </Link>
        <ActorChip actor={actor} />
        <nav className="mt-5 flex flex-col gap-0.5" aria-label="Main">
          <NavLinks items={main} />
        </nav>
        <div className="mb-1.5 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Demo tools</div>
        <nav className="flex flex-col gap-0.5" aria-label="Demo tools">
          <NavLinks items={demo} />
        </nav>
        <div className="mt-auto space-y-2 px-1">
          <IntegrationStatus />
          <SwitchUser />
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <div className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Logo size={26} />
          </Link>
          <SwitchUser />
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2.5" aria-label="Main">
          <NavLinks items={[...main, ...demo]} variant="top" />
        </nav>
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-center gap-2 border-b border-line bg-butter/30 px-4 py-1.5 text-center text-[12px] text-[#6b4d12]">
          <span className="font-semibold">Sandbox demo</span>
          <span aria-hidden>·</span>
          <span className="sm:hidden">No real money, fictional data.</span>
          <span className="hidden sm:inline">No real money. All societies, people and purchases are fictional.</span>
        </div>
        <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

function ActorChip({ actor }: { actor: Actor }) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
      <Image
        src={actor.kind === "member" ? actor.societyIcon : "/art/persona-admin.webp"}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-xl"
      />
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate font-medium text-ink">{actor.name}</div>
        <div className="truncate text-xs text-ink-3">
          {actor.kind === "member" ? `${ROLE_LABEL[actor.role]} · ${actor.societyName.replace(/^UCD /, "")}` : "UCD Societies Council"}
        </div>
      </div>
    </div>
  );
}

function IntegrationStatus() {
  const rows = [
    {
      label: "Stripe",
      ok: stripeEnabled(),
      value: stripeEnabled() ? `Sandbox · Issuing ${env.issuingMode === "stripe" ? "live" : "simulated"}` : "Simulated checkout",
    },
    { label: "JEV", ok: jevEnabled(), value: jevEnabled() ? env.jevModel.split("/").pop()! : "AI offline · rules only" },
  ];
  return (
    <div className="rounded-xl border border-line bg-surface/70 p-2.5 text-[11px] leading-relaxed text-ink-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.ok ? "bg-ok" : "bg-warn"}`} aria-hidden />
          <span className="font-medium text-ink">{r.label}</span>
          <span className="truncate text-ink-3">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
