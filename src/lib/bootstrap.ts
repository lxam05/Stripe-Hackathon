import { getDb } from "./db";
import { DRAMA_STRIPE_ONLY_SEED, seed } from "./seed";

const g = globalThis as unknown as { __balanceSeeding?: Promise<unknown> };

/** First run (or one-time legacy cleanup): create the single-society, zero-card baseline. */
export async function ensureSeeded() {
  const db = getDb();
  const n = db.prepare(`SELECT COUNT(*) n FROM society`).get() as { n: number };
  const current = db.prepare(`SELECT 1 FROM audit_log WHERE action=?`).get(DRAMA_STRIPE_ONLY_SEED);
  if (n.n === 1 && current) return;
  g.__balanceSeeding ??= seed({ log: (s) => console.log(`[seed] ${s}`) }).finally(() => {
    g.__balanceSeeding = undefined;
  });
  await g.__balanceSeeding;
}
