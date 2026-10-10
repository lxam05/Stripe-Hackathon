// Committee roles and officer-card defaults. Pure data, safe to import from client components.

export type Role = "treasurer" | "events_officer" | "chair" | "secretary" | "pro" | "committee";

/** Each society gets this many officer cards (non-cancelled) under the Society Plan. */
export const CARDS_PER_SOCIETY = 5;

export const ROLE_LABEL: Record<string, string> = {
  treasurer: "Treasurer",
  events_officer: "Events officer",
  chair: "Chair",
  secretary: "Secretary",
  pro: "PRO",
  committee: "Committee",
};

export const ROLE_ORDER: Record<string, number> = { treasurer: 0, events_officer: 1, chair: 2, secretary: 3, pro: 4, committee: 5 };

/** Starting limits when the treasurer issues a card. The treasurer pays the big bills. */
export function defaultLimits(role: string) {
  if (role === "treasurer") return { perAuthCapCents: 100_000, monthlyLimitCents: 300_000 };
  if (role === "events_officer") return { perAuthCapCents: 50_000, monthlyLimitCents: 200_000 };
  return { perAuthCapCents: 25_000, monthlyLimitCents: 100_000 };
}

export const MAX_MONTHLY_LIMIT_CENTS = 1_000_000;
