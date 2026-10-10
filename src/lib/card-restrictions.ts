import type Stripe from "stripe";
import { MCC_TABLE, mccInfo } from "./mcc";

export type CardRestrictionProfile = "standard" | "event_essentials" | "trip";

export const CARD_RESTRICTION_PROFILES: Record<
  CardRestrictionProfile,
  { label: string; description: string; allowedGroups: ReadonlySet<string> | null }
> = {
  standard: {
    label: "Standard society spending",
    description: "Everyday society purchases, with university-wide safety categories blocked.",
    allowedGroups: null,
  },
  event_essentials: {
    label: "Event essentials only",
    description: "Food, groceries, printing, venues, equipment, local transport, photography and costumes.",
    allowedGroups: new Set(["food", "groceries", "print", "venue", "transport", "creative", "apparel"]),
  },
  trip: {
    label: "Society trip",
    description: "Event essentials, plus airlines and accommodation.",
    allowedGroups: new Set(["food", "groceries", "print", "venue", "transport", "creative", "apparel", "travel_long", "lodging"]),
  },
};

export const CARD_RESTRICTION_PROFILE_VALUES = Object.keys(CARD_RESTRICTION_PROFILES) as CardRestrictionProfile[];

export function isCardRestrictionProfile(value: unknown): value is CardRestrictionProfile {
  return typeof value === "string" && CARD_RESTRICTION_PROFILE_VALUES.includes(value as CardRestrictionProfile);
}

/** Restricted profiles are allowlists. Unknown merchant categories therefore remain blocked. */
export function profileAllowsMcc(profile: CardRestrictionProfile, mcc: string) {
  const groups = CARD_RESTRICTION_PROFILES[profile].allowedGroups;
  if (!groups) return true;
  const known = MCC_TABLE.some((entry) => entry.code === mcc);
  return known && groups.has(mccInfo(mcc).group);
}

export function stripeCategoryControls(profile: CardRestrictionProfile, globallyBlockedMccs: string[]) {
  const globallyBlocked = new Set(globallyBlockedMccs);
  const blocked = globallyBlockedMccs.map((mcc) => mccInfo(mcc).stripe).filter(Boolean);
  const groups = CARD_RESTRICTION_PROFILES[profile].allowedGroups;

  if (!groups) {
    return {
      allowed_categories: [] as Stripe.Issuing.CardCreateParams.SpendingControls.AllowedCategory[],
      blocked_categories: [...new Set(blocked)] as Stripe.Issuing.CardCreateParams.SpendingControls.BlockedCategory[],
    };
  }

  const allowed = MCC_TABLE.filter((entry) => groups.has(entry.group) && !globallyBlocked.has(entry.code))
    .map((entry) => entry.stripe)
    .filter(Boolean);
  return {
    allowed_categories: [...new Set(allowed)] as Stripe.Issuing.CardCreateParams.SpendingControls.AllowedCategory[],
    blocked_categories: [] as Stripe.Issuing.CardCreateParams.SpendingControls.BlockedCategory[],
  };
}
