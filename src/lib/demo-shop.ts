export const DEMO_PRODUCTS = {
  pizza: {
    id: "pizza",
    name: "Committee pizza night",
    merchant: "DOMINO'S BELFIELD",
    amountCents: 1_840,
    mcc: "5814",
    country: "IE",
    city: "Dublin",
    eyebrow: "Food & refreshments",
    description: "Six pizzas for the cast after rehearsal.",
    tone: "pizza",
  },
  console: {
    id: "console",
    name: "Game console bundle",
    merchant: "GAMESTOP PS5 CONSOLE",
    amountCents: 14_999,
    mcc: "5945",
    country: "IE",
    city: "Dublin",
    eyebrow: "Games & entertainment",
    description: "A console and controller bundle — hard to justify for Drama Society.",
    tone: "console",
  },
} as const;

export type DemoProductId = keyof typeof DEMO_PRODUCTS;

export function isDemoProductId(value: unknown): value is DemoProductId {
  return typeof value === "string" && value in DEMO_PRODUCTS;
}
