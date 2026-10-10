import { getDb } from "./db";
import { seed } from "./seed";

const g = globalThis as unknown as { __balanceSeeding?: Promise<unknown> };

/** First run: generate the synthetic dataset automatically so `npm run dev` just works. */
export async function ensureSeeded() {
  const n = getDb().prepare(`SELECT COUNT(*) n FROM society`).get() as { n: number };
  if (n.n > 0) return;
  g.__balanceSeeding ??= seed({ log: (s) => console.log(`[seed] ${s}`) }).finally(() => {
    g.__balanceSeeding = undefined;
  });
  await g.__balanceSeeding;
}
