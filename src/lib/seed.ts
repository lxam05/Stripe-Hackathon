import { getDb, resetDb } from "./db";
import { seedWorkflowExamples } from "./demo-workflows";
import { captureAuthorization, decideAuthorization } from "./authorize";
import { assessAuthorization } from "./assess";
import { postEntry, societyBalances } from "./ledger";
import { seedGlobalPolicy, setPolicy } from "./policy";
import { addDays, dublinToIso } from "./money";
import type { EventType } from "./mcc";
import { PLAN_LAPSED_REASON, syncSeededCardsToStripe } from "./cards";
import { defaultLimits, MAX_MONTHLY_LIMIT_CENTS, type Role } from "./roles";

// ───────────────────────────────────────────────────────────────────────────────
// Synthetic dataset (PRD §10). Everything here is fictional: societies, people,
// events and purchases are generated with a fixed seed. Merchant descriptors use
// real chain names only as plausible card-statement text.
// Period: 2025-09-01 → 2026-09-30 (labelled history + eval set), plus a few
// current-term (Sept/Oct 2026) events that stay open for the demo.
// ───────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(20261010);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
function normal() {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const logNormalCents = (medianEur: number, sigma = 0.35) => Math.max(150, Math.round(medianEur * Math.exp(sigma * normal()) * 100));
const roundUp = (cents: number, step = 5000) => Math.ceil(cents / step) * step;

type Item = [mcc: string, merchant: string, medianEur: number, country?: string, city?: string];
interface Template {
  name: string;
  type: EventType;
  attendees: [number, number];
  days?: number;
  items: Item[];
  notes?: string;
}

interface SocietySpec {
  id: string;
  name: string;
  slug: string;
  category: string;
  blurb: string;
  plan: "active" | "expired";
  /** Five committee officers, one officer card each. Index 0 is the treasurer, 1 the events officer. */
  members: [string, Role][];
  templates: Template[];
  eventsPerYear: number;
  preapprove?: { mcc: string; types: EventType[] }[];
}

const SOCIETIES: SocietySpec[] = [
  {
    id: "soc_drama",
    name: "UCD Drama Society",
    slug: "drama",
    category: "performing_arts",
    blurb: "Shows, workshops and the best opening nights on campus.",
    plan: "expired",
    members: [
      ["Aoife Byrne", "treasurer"],
      ["Cian Murphy", "events_officer"],
      ["Saoirse Kelly", "chair"],
      ["Darragh Walsh", "secretary"],
      ["Orla Brady", "pro"],
    ],
    eventsPerYear: 20,
    templates: [
      { name: "Freshers' Showcase", type: "social", attendees: [80, 140], items: [["7922", "SMOCK ALLEY THEATRE", 220], ["2741", "SNAP PRINTING DUBLIN 2", 140], ["5814", "DOMINOS RATHMINES", 96]] },
      { name: "Winter Play: The Crucible", type: "other", days: 3, attendees: [150, 300], items: [["7394", "STAGELIGHT HIRE LTD", 260], ["5699", "COSTUME WORKSHOP DUBLIN", 120], ["2741", "SNAP PRINTING DUBLIN 2", 140], ["7333", "LENS & LIGHT PHOTOGRAPHY", 150]] },
      { name: "Pizza & Script Read", type: "social", attendees: [25, 45], items: [["5814", "DOMINOS RATHMINES", 90], ["5411", "SPAR BELFIELD", 30]] },
      { name: "Improv Workshop", type: "academic", attendees: [20, 35], items: [["7399", "THE LAB ROOM HIRE", 120], ["5814", "APACHE PIZZA", 70]] },
      { name: "Cast Party", type: "social", attendees: [30, 60], items: [["5812", "BUNSEN DAWSON ST", 280], ["5814", "BOOJUM", 90]] },
      { name: "Spring Musical: Into the Woods", type: "other", days: 3, attendees: [200, 350], items: [["7394", "STAGELIGHT HIRE LTD", 320], ["5699", "COSTUME WORKSHOP DUBLIN", 150], ["7922", "UCD O'REILLY HALL", 300], ["2741", "SNAP PRINTING DUBLIN 2", 120]] },
    ],
  },
  {
    id: "soc_robotics",
    name: "UCD Robotics Society",
    slug: "robotics",
    category: "tech",
    blurb: "Building robots, drones and the odd self-driving bin since 2011.",
    plan: "active",
    members: [
      ["Niamh O'Brien", "treasurer"],
      ["Conor Ryan", "events_officer"],
      ["Emeka Okafor", "chair"],
      ["Priya Nair", "secretary"],
      ["Daniel Kowalski", "pro"],
    ],
    eventsPerYear: 22,
    preapprove: [
      { mcc: "5045", types: ["academic", "other"] },
      { mcc: "5732", types: ["academic", "other"] },
    ],
    templates: [
      { name: "Freshers' Pizza Social", type: "social", attendees: [60, 120], items: [["5814", "DOMINOS STILLORGAN", 150], ["5411", "TESCO STILLORGAN", 40]] },
      { name: "Arduino Workshop", type: "academic", attendees: [20, 35], items: [["5045", "MOUSER ELECTRONICS", 180], ["5732", "CURRYS BLANCHARDSTOWN", 90], ["5814", "APACHE PIZZA", 90]] },
      { name: "Soldering 101", type: "academic", attendees: [15, 25], items: [["5045", "RS COMPONENTS", 120], ["5943", "EASONS DAWSON ST", 25]] },
      { name: "Hackathon Trip: London", type: "trip", days: 3, attendees: [8, 12], items: [["4511", "RYANAIR", 380], ["7011", "GENERATOR HOSTEL LONDON", 450, "GB", "London"], ["5812", "WAGAMAMA KINGS CROSS", 110, "GB", "London"]] },
      { name: "Robot Wars Night", type: "social", attendees: [50, 90], items: [["5814", "BOOJUM", 160], ["7394", "EVENT AV HIRE", 120]] },
      { name: "Industry Tech Talk", type: "academic", attendees: [60, 100], items: [["5812", "COUNTER CULTURE CATERING", 220], ["2741", "SNAP PRINTING DUBLIN 2", 60]] },
    ],
  },
  {
    id: "soc_law",
    name: "UCD Law Society",
    slug: "law",
    category: "academic",
    blurb: "Mooting, careers and the Law Ball.",
    plan: "active",
    members: [
      ["Róisín Doyle", "treasurer"],
      ["Fionn Gallagher", "events_officer"],
      ["Hannah McCarthy", "chair"],
      ["Adam Nolan", "secretary"],
      ["Grace Okonkwo", "pro"],
    ],
    eventsPerYear: 19,
    templates: [
      { name: "Careers Evening", type: "academic", attendees: [60, 120], notes: "Panel talk + refreshments", items: [["5812", "COUNTER CULTURE CATERING", 250], ["2741", "SNAP PRINTING DUBLIN 2", 80]] },
      { name: "Mooting Competition", type: "academic", attendees: [30, 50], items: [["5942", "HODGES FIGGIS", 60], ["7399", "FOUR COURTS ROOM HIRE", 200], ["4121", "FREENOW", 35]] },
      { name: "Freshers' Mixer", type: "social", attendees: [80, 150], items: [["5814", "BOOJUM", 150], ["5411", "SPAR BELFIELD", 50]] },
      { name: "Guest Lecture", type: "academic", attendees: [80, 200], items: [["4121", "FREENOW", 40], ["5812", "ETTO RESTAURANT", 180]] },
      { name: "Law Ball", type: "social", attendees: [180, 260], items: [["7333", "LENS & LIGHT PHOTOGRAPHY", 300], ["2741", "SNAP PRINTING DUBLIN 2", 80], ["7399", "CLAYTON HOTEL EVENTS", 450]] },
    ],
  },
  {
    id: "soc_hillwalking",
    name: "UCD Hillwalking Club",
    slug: "hillwalking",
    category: "outdoor",
    blurb: "Every weekend, every weather, every Wicklow peak.",
    plan: "active",
    members: [
      ["Sinéad Kavanagh", "treasurer"],
      ["Oisín Brennan", "events_officer"],
      ["Tom Fitzgerald", "chair"],
      ["Lucía García", "secretary"],
      ["Ciara Lynch", "pro"],
    ],
    eventsPerYear: 20,
    templates: [
      { name: "Wicklow Day Hike", type: "sport", attendees: [30, 50], items: [["4131", "DUBLIN COACH HIRE", 450], ["5411", "TESCO BRAY", 80]] },
      { name: "Glendalough Weekend", type: "trip", days: 2, attendees: [25, 40], items: [["4131", "DUBLIN COACH HIRE", 500], ["7011", "AN OIGE GLENDALOUGH", 600], ["5411", "SUPERVALU ROUNDWOOD", 120]] },
      { name: "Snowdonia Trip", type: "trip", days: 4, attendees: [15, 25], items: [["7011", "YHA SNOWDON PEN-Y-PASS", 900, "GB", "Nant Gwynant"], ["4131", "STENA LINE COACH", 400], ["5411", "TESCO BANGOR", 100, "GB", "Bangor"]] },
      { name: "Gear Swap & Social", type: "social", attendees: [30, 60], items: [["5941", "GREAT OUTDOORS", 120], ["5814", "APACHE PIZZA", 80]] },
      { name: "Navigation Workshop", type: "academic", attendees: [15, 30], items: [["5941", "GREAT OUTDOORS", 90], ["2741", "SNAP PRINTING DUBLIN 2", 40]] },
    ],
  },
  {
    id: "soc_esports",
    name: "UCD E-Sports Society",
    slug: "esports",
    category: "gaming",
    blurb: "LANs, leagues and intervarsity glory.",
    plan: "active",
    members: [
      ["Jack Quinn", "treasurer"],
      ["Eoin Duffy", "events_officer"],
      ["Mei Chen", "chair"],
      ["Rory Keane", "secretary"],
      ["Ana Popescu", "pro"],
    ],
    eventsPerYear: 19,
    preapprove: [
      { mcc: "5045", types: ["academic", "other", "sport"] },
      { mcc: "5732", types: ["academic", "other", "sport"] },
    ],
    templates: [
      { name: "LAN Party", type: "other", days: 2, attendees: [40, 80], items: [["5814", "DOMINOS STILLORGAN", 180], ["7394", "EVENT AV HIRE", 200], ["5045", "SCAN COMPUTERS", 150]] },
      { name: "League Tournament", type: "sport", attendees: [30, 60], items: [["7372", "START.GG", 30], ["5814", "BOOJUM", 110]] },
      { name: "Freshers' Game Night", type: "social", attendees: [50, 100], items: [["5814", "APACHE PIZZA", 120], ["5411", "SPAR BELFIELD", 40]] },
      { name: "Streaming Setup Session", type: "academic", attendees: [10, 20], items: [["5732", "CURRYS BLANCHARDSTOWN", 180], ["7372", "STREAMLABS", 30]] },
      { name: "Intervarsity Trip: Cork", type: "trip", days: 2, attendees: [12, 20], items: [["4131", "BUS EIREANN", 300], ["7011", "KINLAY HOUSE CORK", 450]] },
    ],
  },
];

interface Planned {
  eventKey: string;
  date: string;
  time: string;
  mcc: string;
  merchant: string;
  cents: number;
  country: string;
  city: string;
  holderIdx?: number;
  label: { anomaly: boolean; type: string | null };
  captureFactor?: number;
}

interface PlannedEvent {
  key: string;
  societyId: string;
  t: Template;
  start: string;
  end: string;
  attendees: number;
  holderIdx: number;
  current: boolean;
  purchases: Planned[];
}

const TERM_WINDOWS: [string, string][] = [
  ["2025-09-15", "2025-12-05"],
  ["2026-01-20", "2026-04-17"],
];

function randomDate(from: string, to: string) {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return new Date(a + rand() * (b - a)).toISOString().slice(0, 10);
}
const hhmm = (h: number, m = int(0, 59)) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const dayTime = () => hhmm(int(10, 20));

function planNormal(ev: PlannedEvent) {
  const len = ev.t.days ?? 1;
  for (const [mcc, merchant, median, country = "IE", city = "Dublin"] of ev.t.items) {
    const r = rand();
    const times = r < 0.12 ? 3 : r < 0.45 ? 2 : 1;
    for (let i = 0; i < times; i++) {
      const offset = -int(0, 9);
      const date = rand() < 0.25 ? addDays(ev.start, int(0, len - 1)) : addDays(ev.start, offset);
      ev.purchases.push({
        eventKey: ev.key,
        date,
        time: dayTime(),
        mcc,
        merchant,
        cents: logNormalCents(median * (times > 1 ? 0.6 : 1)),
        country,
        city,
        label: { anomaly: false, type: null },
        captureFactor: mcc === "5812" && rand() < 0.4 ? 1.1 : 1,
      });
    }
  }
}

export interface SeedSummary {
  societies: number;
  events: number;
  purchases: number;
  anomalies: number;
  hardNegatives: number;
  evalSet: number;
  flagsOpen: number;
}

export async function seed(opts: { log?: (s: string) => void } = {}): Promise<SeedSummary> {
  const log = opts.log ?? (() => {});
  rand = mulberry32(20261010);
  resetDb();
  const db = getDb();
  seedGlobalPolicy();

  // ── Societies & members ────────────────────────────────────────────────────
  const memberIds: Record<string, string[]> = {};
  for (const s of SOCIETIES) {
    db.prepare(
      `INSERT INTO society (id, name, slug, category, blurb, icon, plan_status, plan_renews_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      s.id,
      s.name,
      s.slug,
      s.category,
      s.blurb,
      `/art/soc-${s.slug}.webp`,
      s.plan,
      s.plan === "active" ? "2027-09-30T22:59:00.000Z" : "2026-09-30T22:59:00.000Z",
    );
    memberIds[s.id] = s.members.map(([name, role], i) => {
      const id = `mem_${s.slug}_${i + 1}`;
      const email = `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ']/g, "").replace(/\s+/g, ".")}@ucdconnect.example`;
      const ref = `M-${(s.slug.charCodeAt(0) * 97 + i * 131 + 0x3a7).toString(16).toUpperCase().padStart(4, "0")}`;
      db.prepare(
        `INSERT INTO member (id, society_id, name, email, role, member_ref, stripe_cardholder_id, cardholder_created_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(id, s.id, name, email, role, ref, `mock_ich_${id}`, "2025-08-28T10:00:00.000Z", "2025-08-20T10:00:00.000Z");
      return id;
    });
    for (const p of s.preapprove ?? []) setPolicy("society", s.id, p.mcc, "review", p.types);
  }

  // ── Plan events & normal purchases ─────────────────────────────────────────
  const events: PlannedEvent[] = [];
  for (const s of SOCIETIES) {
    for (let i = 0; i < s.eventsPerYear; i++) {
      const t = s.templates[i % s.templates.length];
      const [from, to] = TERM_WINDOWS[i % 2 === 0 ? 0 : 1];
      const start = randomDate(from, to);
      const ev: PlannedEvent = {
        key: `${s.slug}-${i}`,
        societyId: s.id,
        t,
        start,
        end: addDays(start, (t.days ?? 1) - 1),
        attendees: int(t.attendees[0], t.attendees[1]),
        holderIdx: rand() < 0.7 ? 1 : int(2, s.members.length - 1),
        current: false,
        purchases: [],
      };
      planNormal(ev);
      events.push(ev);
    }
  }
  // Current term (Sept/Oct 2026) for active societies — these stay open for the demo.
  // [society, template, start, officer whose card spends for it]
  const currentTerm: [string, number, string, number][] = [
    ["soc_robotics", 0, "2026-10-01", 1],
    ["soc_robotics", 1, "2026-10-21", 2],
    ["soc_law", 2, "2026-10-08", 1],
    ["soc_law", 0, "2026-10-23", 3],
    ["soc_hillwalking", 0, "2026-10-11", 1],
    ["soc_esports", 0, "2026-10-16", 1],
  ];
  for (const [sid, ti, start, holderIdx] of currentTerm) {
    const s = SOCIETIES.find((x) => x.id === sid)!;
    const t = s.templates[ti];
    const ev: PlannedEvent = {
      key: `${s.slug}-cur-${ti}`,
      societyId: sid,
      t,
      start,
      end: addDays(start, (t.days ?? 1) - 1),
      attendees: int(t.attendees[0], t.attendees[1]),
      holderIdx,
      current: true,
      purchases: [],
    };
    planNormal(ev);
    ev.purchases = ev.purchases.filter((p) => p.date < "2026-10-10");
    events.push(ev);
  }

  // ── Inject labelled anomalies (~10%) and hard negatives ────────────────────
  const hist = events.filter((e) => !e.current);
  const nonTrip = hist.filter((e) => e.t.type !== "trip");
  const bySoc = (slug: string, pred: (e: PlannedEvent) => boolean = () => true) =>
    hist.filter((e) => e.key.startsWith(slug + "-") && pred(e));
  const add = (ev: PlannedEvent, p: Omit<Planned, "eventKey" | "label" | "country" | "city"> & Partial<Planned>, type: string, anomaly = true) =>
    ev.purchases.push({ eventKey: ev.key, country: "IE", city: "Dublin", ...p, label: { anomaly, type } });
  const near = (ev: PlannedEvent) => addDays(ev.start, -int(0, 6));

  // blocked MCC attempts
  for (const [mcc, merchant, eur] of [
    ["7995", "PADDYPOWER.COM", 50],
    ["7995", "BOYLESPORTS", 20],
    ["4829", "WESTERN UNION", 200],
    ["6011", "ATM BANK OF IRELAND", 100],
    ["5993", "THE CIGAR BOX", 35],
    ["7995", "BETFAIR", 40],
  ] as [string, string, number][]) {
    const ev = pick(nonTrip);
    add(ev, { date: near(ev), time: dayTime(), mcc, merchant, cents: eur * 100 }, "blocked_mcc");
  }
  // personal purchases at plausible MCCs
  for (const [slug, type, mcc, merchant, eur] of [
    ["drama", "social", "5732", "CURRYS BLANCHARDSTOWN", 240],
    ["law", "academic", "5691", "ZARA GRAFTON ST", 89.99],
    ["robotics", "social", "5977", "BOOTS HENRY ST", 45.5],
    ["hillwalking", "academic", "4899", "NETFLIX.COM", 17.99],
    ["hillwalking", "social", "5699", "ASOS.COM", 65],
    ["esports", "social", "5732", "HARVEY NORMAN SWORDS", 349],
    ["law", "social", "5941", "JD SPORTS HENRY ST", 110],
    ["drama", "social", "5921", "OBRIENS WINE OFF LICENCE", 60],
  ] as [string, string, string, string, number][]) {
    const ev = pick(bySoc(slug, (e) => e.t.type === type));
    add(ev, { date: near(ev), time: dayTime(), mcc, merchant, cents: Math.round(eur * 100) }, "personal_purchase");
  }
  // night purchases unrelated to the event
  for (const [mcc, merchant, eur] of [
    ["5411", "SPAR RATHMINES 24HR", 42],
    ["5732", "AMAZON MKTPLACE", 120],
    ["7372", "STEAM GAMES", 59.99],
    ["5999", "AMAZON.IE", 75],
    ["5814", "SUPERMACS OCONNELL ST", 35],
  ] as [string, string, number][]) {
    const ev = pick(nonTrip);
    add(ev, { date: near(ev), time: hhmm(int(2, 4)), mcc, merchant, cents: Math.round(eur * 100) }, "night_purchase");
  }
  // foreign merchant on non-trip events
  for (const [mcc, merchant, eur, country, city] of [
    ["5999", "AMAZON.DE", 80, "DE", "Munich"],
    ["5814", "PRET A MANGER LONDON", 25, "GB", "London"],
    ["5732", "B&H PHOTO NEW YORK", 210, "US", "New York"],
    ["5691", "H&M AMSTERDAM", 70, "NL", "Amsterdam"],
    ["5812", "LE BOUILLON CHARTIER", 140, "FR", "Paris"],
  ] as [string, string, number, string, string][]) {
    const ev = pick(nonTrip);
    add(ev, { date: near(ev), time: dayTime(), mcc, merchant, cents: Math.round(eur * 100), country, city }, "foreign_non_trip");
  }
  // purchases after the event ended
  for (let i = 0; i < 4; i++) {
    const ev = pick(nonTrip);
    const [mcc, merchant, median] = pick(ev.t.items);
    add(ev, { date: addDays(ev.end, int(5, 9)), time: dayTime(), mcc, merchant, cents: logNormalCents(median) }, "after_event");
  }
  // amount outliers (5–10× the norm)
  for (let i = 0; i < 5; i++) {
    const ev = pick(nonTrip);
    const [mcc, merchant, median] = pick(ev.t.items);
    add(ev, { date: near(ev), time: dayTime(), mcc, merchant, cents: Math.round(median * between(5, 10)) * 100 }, "amount_outlier");
  }
  // duplicates of a real purchase a few hours later
  for (let i = 0; i < 5; i++) {
    const ev = pick(nonTrip);
    const orig = pick(ev.purchases.filter((p) => !p.label.anomaly));
    const h = Number(orig.time.slice(0, 2));
    add(ev, { date: orig.date, time: hhmm(Math.min(22, h + int(1, 3))), mcc: orig.mcc, merchant: orig.merchant, cents: orig.cents }, "duplicate");
  }
  // split purchases: two just under the cap within hours (filled in once caps are known)
  const splitEvents = Array.from({ length: 5 }, () => pick(nonTrip));

  // hard negatives: unusual but legitimate
  const hn = (slug: string, pred: (e: PlannedEvent) => boolean, p: Omit<Planned, "eventKey" | "label" | "country" | "city" | "date"> & Partial<Planned>) => {
    const cands = bySoc(slug, pred);
    if (!cands.length) return;
    const ev = pick(cands);
    add(ev, { date: near(ev), holderIdx: p.cents >= 40_000 ? 0 : undefined, ...p }, "hard_negative", false);
  };
  hn("robotics", (e) => e.t.name === "Arduino Workshop", { time: "14:05", mcc: "5045", merchant: "MOUSER ELECTRONICS", cents: 42000 });
  hn("robotics", (e) => e.t.type === "trip", { time: "11:20", mcc: "4511", merchant: "RYANAIR", cents: 52000 });
  hn("hillwalking", (e) => e.t.name === "Snowdonia Trip", { time: "16:40", mcc: "7011", merchant: "YHA SNOWDON PEN-Y-PASS", cents: 95000, country: "GB", city: "Nant Gwynant" });
  hn("hillwalking", (e) => e.t.name === "Glendalough Weekend", { time: "09:30", mcc: "4131", merchant: "DUBLIN COACH HIRE", cents: 90000 });
  hn("law", (e) => e.t.name === "Law Ball", { time: "13:00", mcc: "5812", merchant: "THE SHELBOURNE BANQUETING", cents: 145000 });
  hn("drama", (e) => e.t.name === "Cast Party", { time: "01:35", mcc: "4121", merchant: "FREENOW", cents: 3800 });
  hn("esports", (e) => e.t.name === "Streaming Setup Session", { time: "15:10", mcc: "5732", merchant: "CURRYS BLANCHARDSTOWN", cents: 26000 });
  hn("drama", (e) => e.t.type === "other", { time: "19:00", mcc: "5699", merchant: "ETSY COSTUME SUPPLY", cents: 4500, country: "US", city: "Brooklyn" });

  // Current-term flagged purchases so the review queue isn't empty for other societies.
  const cur = (k: string) => events.find((e) => e.key === k)!;
  add(cur("robotics-cur-0"), { date: "2026-09-29", time: "02:47", mcc: "5732", merchant: "CURRYS DUNDRUM", cents: 18900 }, "night_purchase");
  add(cur("law-cur-2"), { date: "2026-10-06", time: "18:22", mcc: "5813", merchant: "THE BANK ON COLLEGE GREEN", cents: 14500 }, "personal_purchase");
  add(cur("esports-cur-0"), { date: "2026-10-09", time: "23:58", mcc: "7995", merchant: "BETFAIR", cents: 5000 }, "blocked_mcc");
  add(cur("robotics-cur-0"), { date: "2026-09-30", time: "15:02", mcc: "5814", merchant: "DOMINOS STILLORGAN", cents: 13200 }, "duplicate");
  add(cur("robotics-cur-0"), { date: "2026-09-30", time: "15:09", mcc: "5814", merchant: "DOMINOS STILLORGAN", cents: 13200 }, "duplicate");
  add(cur("hillwalking-cur-0"), { date: "2026-10-07", time: "12:15", mcc: "5941", merchant: "GREAT OUTDOORS", cents: 9600 }, "normal");
  cur("hillwalking-cur-0").purchases.at(-1)!.label = { anomaly: false, type: null };

  // ── Budgets (treasurers leave ~30% slack) ──────────────────────────────────
  const isNormal = (p: Planned) => !p.label.anomaly || ["personal_purchase", "night_purchase", "foreign_non_trip", "duplicate"].includes(p.label.type!);
  const budgets = new Map<string, number>();
  for (const ev of events) {
    const sum = ev.purchases.filter(isNormal).reduce((s, p) => s + p.cents, 0) + (ev.current ? 20000 : 0);
    budgets.set(ev.key, roundUp(sum * 1.3));
  }

  // ── Officer cards: one per committee member, limits sized from what they buy ──
  const spec = (societyId: string) => SOCIETIES.find((x) => x.id === societyId)!;
  const holderOf = (ev: PlannedEvent, p?: Planned) => memberIds[ev.societyId][Math.min(p?.holderIdx ?? ev.holderIdx, spec(ev.societyId).members.length - 1)];
  const cardOf = (memberId: string) => memberId.replace(/^mem_/, "card_");
  const roleOf = new Map(SOCIETIES.flatMap((s) => s.members.map(([, role], i) => [memberIds[s.id][i], role] as const)));
  const caps = new Map<string, number>();
  for (const [memberId, role] of roleOf) caps.set(memberId, defaultLimits(role).perAuthCapCents);
  for (const ev of events) {
    for (const p of ev.purchases.filter(isNormal)) {
      const m = holderOf(ev, p);
      caps.set(m, Math.max(caps.get(m)!, roundUp(p.cents * 1.15)));
    }
  }
  for (const ev of splitEvents) {
    const cap = caps.get(holderOf(ev))!;
    const d = near(ev);
    const h = int(10, 16);
    const a1 = Math.round(cap * between(0.85, 0.98));
    const a2 = Math.round(cap * between(0.85, 0.98));
    const [mcc, merchant] = pick(ev.t.items);
    add(ev, { date: d, time: hhmm(h), mcc, merchant, cents: a1 }, "split_purchase");
    add(ev, { date: d, time: hhmm(h + int(1, 3)), mcc, merchant, cents: a2 }, "split_purchase");
    budgets.set(ev.key, roundUp(budgets.get(ev.key)! + a1 + a2));
  }
  // Monthly limits leave 20% headroom over each officer's busiest month, so the history
  // replays without tripping them.
  const monthly = new Map<string, Map<string, number>>();
  for (const ev of events) {
    for (const p of ev.purchases) {
      const m = holderOf(ev, p);
      const byMonth = monthly.get(m) ?? new Map<string, number>();
      byMonth.set(p.date.slice(0, 7), (byMonth.get(p.date.slice(0, 7)) ?? 0) + p.cents);
      monthly.set(m, byMonth);
    }
  }
  for (const s of SOCIETIES) {
    for (const memberId of memberIds[s.id]) {
      const role = roleOf.get(memberId)!;
      const busiest = Math.max(0, ...(monthly.get(memberId)?.values() ?? []));
      const cap = caps.get(memberId)!;
      const limit = Math.min(MAX_MONTHLY_LIMIT_CENTS, Math.max(defaultLimits(role).monthlyLimitCents, cap, roundUp(busiest * 1.2, 50000)));
      db.prepare(
        `INSERT INTO card (id, society_id, member_id, event_id, network, stripe_card_id, last4, exp_month, exp_year, status, per_auth_cap_cents, monthly_limit_cents, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(cardOf(memberId), s.id, memberId, null, "mock", `mock_ic_${memberId}`, String(int(1000, 9999)), 8, 2028, "active", Math.min(cap, limit), limit, "2025-08-28T10:05:00.000Z");
    }
  }

  // ── Write events ──────────────────────────────────────────────────────────
  const eventIdOf = (ev: PlannedEvent) => `evt_${ev.key.replace(/-/g, "_")}`;
  for (const ev of events) {
    db.prepare(
      `INSERT INTO event (id, society_id, name, type, start_date, end_date, expected_attendees, budget_cents, status, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(eventIdOf(ev), ev.societyId, ev.t.name, ev.t.type, ev.start, ev.end, ev.attendees, budgets.get(ev.key)!, "open", ev.t.notes ?? "", dublinToIso(addDays(ev.start, -21), "10:00"));
  }

  // ── Funding schedule ──────────────────────────────────────────────────────
  type Step = { at: string; kind: "fund" | "buy" | "close"; run: () => void | Promise<void> };
  const steps: Step[] = [];
  const sponsors = ["Accenture Ireland", "Stripe", "Workday", "Mason Hayes & Curran", "Intel Ireland", "Patagonia Dublin", "Logitech", "UCD Alumni Fund"];
  for (const s of SOCIETIES) {
    const spend = events.filter((e) => e.societyId === s.id).flatMap((e) => e.purchases).reduce((t, p) => t + p.cents, 0);
    const plan: [string, "ucd" | "sponsor", string, number][] = [
      ["2025-09-08", "ucd", "UCD Societies Council grant", 0.55],
      ["2025-09-24", "sponsor", pick(sponsors), 0.2],
      ["2026-01-14", "ucd", "UCD Societies Council grant", 0.45],
      ["2026-02-03", "sponsor", pick(sponsors), 0.2],
      ["2026-09-07", "ucd", "UCD Societies Council grant", 0.3],
    ];
    for (const [date, payer, name, frac] of plan) {
      if (s.plan === "expired" && date >= "2026-09-01") continue;
      const amount = roundUp(spend * frac, 5000);
      steps.push({
        at: dublinToIso(date, "09:00"),
        kind: "fund",
        run: () => {
          const id = `top_${s.slug}_${date.replace(/-/g, "")}`;
          db.prepare(
            `INSERT INTO topup (id, society_id, payer_type, payer_name, message, show_publicly, amount_cents, checkout_session_id, status, created_at, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          ).run(id, s.id, payer, name, payer === "sponsor" ? "Best of luck this year!" : "", payer === "sponsor" ? 1 : 0, amount, `seed_cs_${id}`, "paid", dublinToIso(date, "09:00"), dublinToIso(date, "09:00"));
          postEntry({ societyId: s.id, type: "topup", amountCents: amount, refType: "topup", refId: id, memo: name, at: dublinToIso(date, "09:00") });
        },
      });
    }
  }

  // ── Purchases + closures, replayed chronologically through the real engine ──
  const labels: { authId: string; anomaly: boolean; type: string | null; at: string }[] = [];
  for (const ev of events) {
    const eventId = eventIdOf(ev);
    for (const p of ev.purchases) {
      const at = dublinToIso(p.date, p.time);
      const cardId = cardOf(holderOf(ev, p));
      steps.push({
        at,
        kind: "buy",
        run: () => {
          const d = decideAuthorization({ cardId, eventId, amountCents: p.cents, merchantName: p.merchant, mcc: p.mcc, merchantCity: p.city, merchantCountry: p.country, at, source: "seed" });
          if (!d.authorizationId) return;
          labels.push({ authId: d.authorizationId, anomaly: p.label.anomaly, type: p.label.type, at });
          if (d.approved && !(ev.current && p.date >= "2026-10-08")) {
            const capAt = new Date(new Date(at).getTime() + int(2, 30) * 3600_000).toISOString();
            captureAuthorization(d.authorizationId, Math.round(p.cents * (p.captureFactor ?? 1)), capAt);
          }
        },
      });
    }
    if (!ev.current) {
      steps.push({
        at: dublinToIso(addDays(ev.end, 10), "23:00"),
        kind: "close",
        run: () => {
          db.prepare(`UPDATE event SET status='closed' WHERE id=?`).run(eventId);
        },
      });
    }
  }
  steps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === "fund" ? -1 : 1));
  for (const st of steps) await st.run();
  log(`replayed ${steps.length} steps`);

  // Rules-only assessments for all history (JEV can be re-run on demand from the UI).
  const allAuth = db.prepare(`SELECT id FROM authorization ORDER BY created_at`).all() as { id: string }[];
  for (const a of allAuth) await assessAuthorization(a.id, { skipJev: true, actor: "seed" });

  // Labels + 70/30 history/eval split on the 2025/26 year, stratified by label so
  // every anomaly type appears in the evaluation set.
  const strata = new Map<string, typeof labels>();
  for (const l of labels) {
    if (l.at >= "2026-09-01T00:00:00Z") continue;
    const k = l.type ?? "normal";
    strata.set(k, [...(strata.get(k) ?? []), l]);
  }
  const evalIds = new Set<string>();
  for (const group of strata.values()) {
    const shuffled = [...group].sort(() => rand() - 0.5);
    shuffled.slice(0, Math.max(1, Math.round(group.length * 0.3))).forEach((l) => evalIds.add(l.authId));
  }
  const ins = db.prepare(`INSERT INTO synthetic_label (authorization_id, is_anomaly, anomaly_type, eval_set) VALUES (?,?,?,?)`);
  for (const l of labels) ins.run(l.authId, l.anomaly ? 1 : 0, l.type, evalIds.has(l.authId) ? 1 : 0);
  const evalCount = evalIds.size;

  // Resolve last year's flags as the treasurer would have; current-term flags stay open.
  const flags = db
    .prepare(
      `SELECT f.id, a.created_at, l.is_anomaly FROM flag f JOIN authorization a ON a.id=f.authorization_id LEFT JOIN synthetic_label l ON l.authorization_id=a.id`,
    )
    .all() as { id: string; created_at: string; is_anomaly: number | null }[];
  for (const f of flags) {
    if (f.created_at >= "2026-09-01T00:00:00Z") continue;
    const resolvedAt = new Date(new Date(f.created_at).getTime() + 2 * 86400_000).toISOString();
    db.prepare(`UPDATE flag SET status=?, resolution_note=?, resolved_by=?, resolved_at=?, created_at=? WHERE id=?`).run(
      f.is_anomaly ? "fraud" : "legit",
      f.is_anomaly ? "Confirmed misuse; purchaser repaid the society (synthetic)." : "Checked with the purchaser: legitimate society spend (synthetic).",
      "seed",
      resolvedAt,
      f.created_at,
      f.id,
    );
  }
  db.prepare(`UPDATE flag SET created_at=(SELECT created_at FROM authorization WHERE id=flag.authorization_id)`).run();
  db.prepare(
    `UPDATE risk_assessment SET created_at=(SELECT created_at FROM authorization WHERE id=risk_assessment.authorization_id)`,
  ).run();

  // This term's events: the officer running each one has pointed their card at it.
  for (const ev of events.filter((e) => e.current)) {
    db.prepare(`UPDATE card SET event_id=? WHERE id=?`).run(eventIdOf(ev), cardOf(holderOf(ev)));
  }
  // Drama's plan lapsed on 30 Sept, so its officer cards are frozen until it renews.
  db.prepare(`UPDATE card SET status='inactive', status_reason=? WHERE society_id='soc_drama'`).run(PLAN_LAPSED_REASON);

  // Drama's 2025/26 year ended: unspent grant returned, €180 carried over for 2026/27.
  const drama = societyBalances("soc_drama");
  const carry = 18_000;
  if (drama.available > carry) {
    postEntry({ societyId: "soc_drama", type: "transfer_out", amountCents: drama.available - carry, refType: "year_end", refId: "2025-26", memo: "Year-end: unspent grant returned to Societies Office", at: dublinToIso("2026-09-30", "17:00") });
  }

  const summary: SeedSummary = {
    societies: SOCIETIES.length,
    events: events.length,
    purchases: labels.length,
    anomalies: labels.filter((l) => l.anomaly).length,
    hardNegatives: labels.filter((l) => l.type === "hard_negative").length,
    evalSet: evalCount,
    flagsOpen: (db.prepare(`SELECT COUNT(*) n FROM flag WHERE status='open'`).get() as { n: number }).n,
  };
  seedWorkflowExamples();
  // ISSUING_MODE=stripe: back every seeded officer card with a real sandbox Issuing card.
  await syncSeededCardsToStripe(log);
  log(JSON.stringify(summary));
  return summary;
}
