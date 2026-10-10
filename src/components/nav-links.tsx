"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CreditCard,
  FlaskConical,
  Gift,
  LayoutDashboard,
  Receipt,
  ShieldAlert,
  BadgeCheck,
} from "lucide-react";
import { cx } from "./ui";

const ICONS = {
  dashboard: LayoutDashboard,
  events: CalendarDays,
  review: ShieldAlert,
  transactions: Receipt,
  funding: Gift,
  plan: BadgeCheck,
  simulator: CreditCard,
  eval: FlaskConical,
  admin: Building2,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}

export function NavLinks({ items, variant = "side" }: { items: NavItem[]; variant?: "side" | "top" }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href + "/")) || path === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group flex items-center gap-2.5 rounded-xl text-[14px] transition-colors",
              variant === "side" ? "px-3 py-2" : "shrink-0 px-3 py-1.5",
              active ? "bg-stone text-white" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
            )}
          >
            <Icon className={cx("h-4 w-4 shrink-0", active ? "text-mint" : "text-ink-3 group-hover:text-ink-2")} aria-hidden />
            <span className="truncate">{it.label}</span>
            {!!it.badge && (
              <span
                className={cx(
                  "ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular leading-5",
                  active ? "bg-coral text-white" : "bg-coral/15 text-[#a8452c]",
                )}
                aria-label={`${it.badge} open`}
              >
                {it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
