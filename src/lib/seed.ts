import { audit, getDb, resetDb } from "./db";
import { dublinToIso } from "./money";
import { seedGlobalPolicy } from "./policy";
import type { Role } from "./roles";

// The product starts with one real society and no cards. Officer cards are never
// fixtures: a treasurer must issue them from the Cards page, which creates them in
// Stripe Issuing and stores only the local projection needed by Balance.

const DRAMA_MEMBERS: [name: string, role: Role][] = [
  ["Aoife Byrne", "treasurer"],
  ["Cian Murphy", "events_officer"],
  ["Saoirse Kelly", "chair"],
  ["Darragh Walsh", "secretary"],
  ["Orla Brady", "pro"],
];

export const DRAMA_STRIPE_ONLY_SEED = "system.seed.drama_stripe_only_v1";

export interface SeedSummary {
  societies: number;
  events: number;
  purchases: number;
  anomalies: number;
  hardNegatives: number;
  evalSet: number;
  flagsOpen: number;
}

export async function seed(opts: { log?: (message: string) => void } = {}): Promise<SeedSummary> {
  const log = opts.log ?? (() => {});
  resetDb();
  const db = getDb();
  seedGlobalPolicy();

  db.prepare(
    `INSERT INTO society (id, name, slug, category, blurb, icon, plan_status, plan_renews_at)
     VALUES ('soc_drama', 'UCD Drama Society', 'drama', 'performing_arts', ?, '/art/soc-drama.webp', 'active', ?)`,
  ).run("Shows, workshops and the best opening nights on campus.", "2027-09-30T22:59:00.000Z");

  for (const [index, [name, role]] of DRAMA_MEMBERS.entries()) {
    const id = `mem_drama_${index + 1}`;
    const email = `${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f']/g, "").replace(/\s+/g, ".")}@ucdconnect.example`;
    db.prepare(
      `INSERT INTO member (id, society_id, name, email, role, member_ref, stripe_cardholder_id, cardholder_created_at, created_at)
       VALUES (?, 'soc_drama', ?, ?, ?, ?, NULL, NULL, ?)`,
    ).run(id, name, email, role, `DRAMA-${String(index + 1).padStart(2, "0")}`, "2026-09-01T09:00:00.000Z");
  }

  const events = [
    ["evt_drama_freshers", "Freshers' Showcase", "social", "2026-10-16", "2026-10-16", 120, 60_000, "Welcome performance and cast social."],
    ["evt_drama_autumn", "Autumn Play", "other", "2026-11-12", "2026-11-14", 240, 180_000, "Venue, costumes, printing and cast food."],
  ] as const;
  const insertEvent = db.prepare(
    `INSERT INTO event (id, society_id, name, type, start_date, end_date, expected_attendees, budget_cents, status, notes, created_at)
     VALUES (?, 'soc_drama', ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  );
  for (const event of events) insertEvent.run(...event, dublinToIso("2026-09-15", "10:00"));

  audit("system", DRAMA_STRIPE_ONLY_SEED, "soc_drama", { cards: 0, source: "stripe-only" });
  const summary: SeedSummary = {
    societies: 1,
    events: events.length,
    purchases: 0,
    anomalies: 0,
    hardNegatives: 0,
    evalSet: 0,
    flagsOpen: 0,
  };
  log(JSON.stringify(summary));
  return summary;
}
