import { getDb } from "./db";
import { seed } from "./seed";

export async function prepareDemo(log: (message: string) => void = () => {}) {
  await seed({ log });
  const db = getDb();
  const societies = (db.prepare(`SELECT COUNT(*) count FROM society`).get() as { count: number }).count;
  const cards = (db.prepare(`SELECT COUNT(*) count FROM card`).get() as { count: number }).count;
  if (societies !== 1 || cards !== 0) throw new Error(`Preparation failed: expected one society and zero cards; found ${societies} societies and ${cards} cards.`);
  log("ready: Drama Society only, with zero cards. Issue every card from the Cards page through Stripe Issuing.");
  return { societyId: "soc_drama", cards };
}
