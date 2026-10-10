// Merchant Category Codes (public ISO 18245 / card-network taxonomy) and the default
// Balance policy from PRD §7.2. `stripe` is the Stripe Issuing category enum name used in
// spending_controls and test-helper authorisations (checked against stripe-node v23 types).

export type MccPolicyAction = "block" | "review" | "allow";
export type EventType = "social" | "academic" | "sport" | "trip" | "other";

export interface MccInfo {
  code: string;
  label: string;
  group: string;
  stripe: string;
  defaultPolicy: MccPolicyAction;
}

const T: MccInfo[] = [
  // Blocked (UCD-wide)
  { code: "7995", label: "Betting / casino / gambling", group: "gambling", stripe: "betting_casino_gambling", defaultPolicy: "block" },
  { code: "6051", label: "Quasi-cash / money orders", group: "cash", stripe: "non_fi_money_orders", defaultPolicy: "block" },
  { code: "4829", label: "Wire transfers / money orders", group: "cash", stripe: "wires_money_orders", defaultPolicy: "block" },
  { code: "6010", label: "Manual cash disbursement", group: "cash", stripe: "manual_cash_disburse", defaultPolicy: "block" },
  { code: "6011", label: "ATM cash withdrawal", group: "cash", stripe: "automated_cash_disburse", defaultPolicy: "block" },
  { code: "6540", label: "Stored-value card loads", group: "cash", stripe: "non_fi_stored_value_card_purchase_load", defaultPolicy: "block" },
  { code: "5993", label: "Tobacco / cigar stores", group: "tobacco", stripe: "cigar_stores_and_stands", defaultPolicy: "block" },
  { code: "7273", label: "Dating / escort services", group: "adult", stripe: "dating_escort_services", defaultPolicy: "block" },
  // Review (conditional)
  { code: "5813", label: "Bars / pubs / nightclubs", group: "alcohol", stripe: "drinking_places", defaultPolicy: "review" },
  { code: "5921", label: "Off-licence (beer, wine, spirits)", group: "alcohol", stripe: "package_stores_beer_wine_and_liquor", defaultPolicy: "review" },
  { code: "5732", label: "Electronics stores", group: "tech", stripe: "electronics_stores", defaultPolicy: "review" },
  { code: "5945", label: "Games, toys & hobbies", group: "games", stripe: "hobby_toy_and_game_shops", defaultPolicy: "allow" },
  { code: "5045", label: "Computers & peripherals", group: "tech", stripe: "computers_peripherals_and_software", defaultPolicy: "review" },
  { code: "4511", label: "Airlines", group: "travel_long", stripe: "airlines_air_carriers", defaultPolicy: "review" },
  { code: "7011", label: "Hotels / hostels", group: "lodging", stripe: "hotels_motels_and_resorts", defaultPolicy: "review" },
  // Normal society spend
  { code: "5812", label: "Restaurants", group: "food", stripe: "eating_places_restaurants", defaultPolicy: "allow" },
  { code: "5814", label: "Fast food", group: "food", stripe: "fast_food_restaurants", defaultPolicy: "allow" },
  { code: "5411", label: "Groceries / supermarkets", group: "groceries", stripe: "grocery_stores_supermarkets", defaultPolicy: "allow" },
  { code: "5943", label: "Stationery", group: "print", stripe: "stationery_stores_office_and_school_supply_stores", defaultPolicy: "allow" },
  { code: "2741", label: "Printing & publishing", group: "print", stripe: "miscellaneous_publishing_and_printing", defaultPolicy: "allow" },
  { code: "7922", label: "Tickets / theatrical producers", group: "venue", stripe: "theatrical_ticket_agencies", defaultPolicy: "allow" },
  { code: "7399", label: "Business services (room hire)", group: "venue", stripe: "miscellaneous_business_services", defaultPolicy: "allow" },
  { code: "7394", label: "Equipment rental", group: "venue", stripe: "equipment_rental", defaultPolicy: "allow" },
  { code: "4121", label: "Taxis", group: "transport", stripe: "taxicabs_limousines", defaultPolicy: "allow" },
  { code: "4131", label: "Bus / coach hire", group: "transport", stripe: "bus_lines", defaultPolicy: "allow" },
  { code: "7333", label: "Photography & graphics", group: "creative", stripe: "commercial_photography_art_and_graphics", defaultPolicy: "allow" },
  { code: "5942", label: "Book stores", group: "print", stripe: "book_stores", defaultPolicy: "allow" },
  { code: "7372", label: "Software / data services", group: "software", stripe: "computer_programming", defaultPolicy: "allow" },
  { code: "5699", label: "Costumes & apparel", group: "apparel", stripe: "miscellaneous_apparel_and_accessory_shops", defaultPolicy: "allow" },
  { code: "5691", label: "Clothing stores", group: "apparel", stripe: "mens_womens_clothing_stores", defaultPolicy: "allow" },
  { code: "5941", label: "Sporting goods", group: "sport_gear", stripe: "sporting_goods_stores", defaultPolicy: "allow" },
  { code: "5977", label: "Cosmetics", group: "personal", stripe: "cosmetic_stores", defaultPolicy: "allow" },
  { code: "4899", label: "Streaming / subscriptions", group: "personal", stripe: "cable_satellite_and_other_pay_television_and_radio", defaultPolicy: "allow" },
  { code: "5999", label: "Specialty retail", group: "retail", stripe: "miscellaneous_specialty_retail", defaultPolicy: "allow" },
];

export const MCC_TABLE = T;
const byCode = new Map(T.map((m) => [m.code, m]));
const byStripe = new Map(T.map((m) => [m.stripe, m]));

export function mccInfo(code: string): MccInfo {
  return (
    byCode.get(code) ?? {
      code,
      label: `MCC ${code}`,
      group: `mcc_${code}`,
      stripe: "",
      defaultPolicy: "allow",
    }
  );
}

export const mccFromStripeCategory = (cat: string) => byStripe.get(cat);

export const BLOCKED_MCCS = T.filter((m) => m.defaultPolicy === "block").map((m) => m.code);
export const REVIEW_MCCS = T.filter((m) => m.defaultPolicy === "review").map((m) => m.code);

/** Event types that pre-approve a review-listed MCC by default (PRD §7.2). */
export const DEFAULT_PREAPPROVED: Record<string, EventType[]> = {
  "4511": ["trip"],
  "7011": ["trip"],
};

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "social", label: "Social" },
  { value: "academic", label: "Academic / workshop" },
  { value: "sport", label: "Sport / competition" },
  { value: "trip", label: "Trip / travel" },
  { value: "other", label: "Other" },
];
