// Committee roles and officer-card defaults. Pure data, safe to import from client components.

export type Role = "treasurer" | "senior_treasurer" | "member" | "auditor" | "events_officer" | "chair" | "secretary" | "pro" | "committee";

/** Each society gets this many officer cards (non-cancelled) under the Society Plan. */
export const CARDS_PER_SOCIETY = 5;

export const ROLE_LABEL: Record<string, string> = {
  treasurer: "Treasurer",
  senior_treasurer: "Senior treasurer",
  member: "Member",
  auditor: "Auditor",
  events_officer: "Events officer",
  chair: "Chair",
  secretary: "Secretary",
  pro: "PRO",
  committee: "Committee",
};

export const ROLE_ORDER: Record<string, number> = { treasurer: 0, senior_treasurer: 1, auditor: 2, events_officer: 3, chair: 4, secretary: 5, pro: 6, committee: 7, member: 8 };

/** Starting limits when the treasurer issues a card. The treasurer pays the big bills. */
export function defaultLimits(role: string) {
  if (role === "treasurer") return { perAuthCapCents: 100_000, monthlyLimitCents: 300_000 };
  if (role === "events_officer") return { perAuthCapCents: 50_000, monthlyLimitCents: 200_000 };
  if (role === "pro") return { perAuthCapCents: 20_000, monthlyLimitCents: 50_000 };
  return { perAuthCapCents: 25_000, monthlyLimitCents: 100_000 };
}

export const MAX_MONTHLY_LIMIT_CENTS = 1_000_000;
