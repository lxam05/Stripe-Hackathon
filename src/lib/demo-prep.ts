import { DEMO_TREASURER_ID, resetDemoCards } from "./cards";
import { getDb } from "./db";
import { fmtEur } from "./money";
import { seed } from "./seed";
import { getStripe } from "./stripe";

const ISSUING_FLOAT_CENTS = 2_000_000;

/**
 * Demo starting point: Drama Society only, €0 balance, and one card (the treasurer's) in Stripe,
 * so the events officer's card can be issued live. Also keeps the sandbox Issuing balance funded:
 * Stripe declines shop purchases on an empty Issuing balance before Balance is asked.
 */
export async function prepareDemo(log: (message: string) => void = () => {}) {
  await seed({ log });
  const bal = await getStripe().balance.retrieve();
  const eur = bal.issuing?.available.find((b) => b.currency === "eur")?.amount ?? 0;
  if (eur < ISSUING_FLOAT_CENTS) {
    await getStripe().rawRequest("POST", "/v1/test_helpers/issuing/fund_balance", { amount: 5_000_000, currency: "eur" });
    log(`funded the sandbox Issuing balance (was ${fmtEur(eur)})`);
  }
  await resetDemoCards("soc_drama", log);

  const db = getDb();
  const societies = (db.prepare(`SELECT COUNT(*) count FROM society`).get() as { count: number }).count;
  const cards = db.prepare(`SELECT member_id FROM card WHERE status != 'canceled'`).all() as { member_id: string }[];
  if (societies !== 1 || cards.length !== 1 || cards[0].member_id !== DEMO_TREASURER_ID) {
    throw new Error(`Preparation failed: expected one society and only the treasurer's card; found ${societies} societies and ${cards.length} live cards.`);
  }
  log("ready: Drama Society with only Aoife's card. Issue Cian's card from the Cards page during the demo.");
  return { societyId: "soc_drama", cards: cards.length };
}
