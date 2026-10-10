import type Stripe from "stripe";
import { env } from "./env";
import { audit, getDb, newId, nowIso } from "./db";
import { mccInfo } from "./mcc";
import { dublinParts, dublinToIso, fmtEur } from "./money";
import { UserError } from "./errors";
import { globalBlockedMccs } from "./policy";
import { CARDS_PER_SOCIETY, MAX_MONTHLY_LIMIT_CENTS, ROLE_LABEL } from "./roles";
import { getStripe } from "./stripe";

// Officer cards. Each society gets up to CARDS_PER_SOCIETY live cards, one per committee
// member. A card can point at one open event at a time; purchases then come out of that
// event's budget. Unassigned cards spend from the society's unallocated money.
//
// CardNetworkAdapter (PRD §13.2). MockAdapter produces the same card objects and
// authorisation events locally, so the risk / ledger / JEV demo works even if
// Stripe Issuing isn't enabled on the sandbox account.

export type CardStatus = "pending" | "active" | "inactive" | "canceled";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  stripe_cardholder_id: string | null;
  cardholder_created_at: string | null;
}

interface IssueParams {
  memberId: string;
  role: string;
  societyId: string;
  perAuthCapCents: number;
  monthlyLimitCents: number;
}

interface CardNetwork {
  name: "mock" | "stripe";
  ensureCardholder(m: MemberRow): Promise<string>;
  createCard(cardholderId: string, p: IssueParams): Promise<{ id: string; last4: string; expMonth: number; expYear: number }>;
  setStatus(stripeCardId: string | null, status: Exclude<CardStatus, "pending">): Promise<void>;
  setLimits(stripeCardId: string | null, perAuthCapCents: number, monthlyLimitCents: number): Promise<void>;
}

const mockNetwork: CardNetwork = {
  name: "mock",
  async ensureCardholder(m) {
    return m.stripe_cardholder_id ?? `mock_ich_${m.id}`;
  },
  async createCard() {
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const d = new Date();
    return { id: newId("mock_ic"), last4, expMonth: d.getMonth() + 1, expYear: d.getFullYear() + 3 };
  },
  async setStatus() {},
  async setLimits() {},
};

// EU cards need a phone on the cardholder for 3-D Secure; members don't store one, so the
// sandbox uses the UCD switchboard.
const SANDBOX_CARDHOLDER_PHONE = "+35317167777";

// The treasurer's caps are review thresholds (authorize.ts H5/H6): over-cap purchases go
// through and get flagged, so they must not become hard Stripe limits. Stripe only enforces
// the Societies Office ceiling; setting it also replaces Stripe's default 500 USD/day limit.
const STRIPE_BACKSTOP_LIMITS = [{ amount: MAX_MONTHLY_LIMIT_CENTS, interval: "monthly" as const }];

const stripeNetwork: CardNetwork = {
  name: "stripe",
  // One cardholder per person: every card (new, replacement, reseeded) reuses it.
  async ensureCardholder(m) {
    if (m.stripe_cardholder_id && !m.stripe_cardholder_id.startsWith("mock_")) return m.stripe_cardholder_id;
    const existing = (await getStripe().issuing.cardholders.list({ email: m.email, status: "active", limit: 10 })).data.find(
      (c) => c.metadata?.member_id === m.id,
    );
    if (existing) {
      if (!existing.phone_number) await getStripe().issuing.cardholders.update(existing.id, { phone_number: SANDBOX_CARDHOLDER_PHONE });
      return existing.id;
    }
    const [first, ...rest] = m.name.replace(/\s*\(demo\)\s*/i, "").split(" ");
    const ch = await getStripe().issuing.cardholders.create({
      type: "individual",
      name: m.name.replace(/\s*\(demo\)\s*/i, ""),
      email: m.email,
      phone_number: SANDBOX_CARDHOLDER_PHONE,
      billing: { address: { line1: "UCD Student Centre, Belfield", city: "Dublin", state: "Co. Dublin", postal_code: "D04 V1W8", country: "IE" } },
      individual: {
        first_name: first,
        last_name: rest.join(" ") || "Member",
        card_issuing: { user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" } },
      },
      metadata: { member_id: m.id, balance_env: "sandbox" },
    });
    return ch.id;
  },
  async createCard(cardholderId, p) {
    const blocked = globalBlockedMccs()
      .map((c) => mccInfo(c).stripe)
      .filter(Boolean) as Stripe.Issuing.CardCreateParams.SpendingControls.BlockedCategory[];
    const card = await getStripe().issuing.cards.create({
      cardholder: cardholderId,
      currency: "eur",
      type: "virtual",
      status: "active",
      spending_controls: {
        blocked_categories: blocked,
        spending_limits: STRIPE_BACKSTOP_LIMITS,
      },
      metadata: { society_id: p.societyId, member_id: p.memberId, role: p.role, balance_env: "sandbox" },
    });
    return { id: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
  },
  async setStatus(stripeCardId, status) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, { status });
  },
  async setLimits(stripeCardId) {
    if (!stripeCardId) return;
    // Thresholds live in our DB; this just moves legacy cards off old hard limits onto the backstop.
    await getStripe().issuing.cards.update(stripeCardId, {
      spending_controls: { spending_limits: STRIPE_BACKSTOP_LIMITS },
    });
  },
};

export const cardNetwork = (): CardNetwork => (env.issuingMode === "stripe" ? stripeNetwork : mockNetwork);

const ISSUING_FLOAT_CENTS = 2_000_000;

/**
 * Seeded cards are written as mock rows; in Stripe mode give each one a real sandbox card
 * (reusing the officer's cardholder), cancel cards left over from earlier seeds, and keep the
 * sandbox Issuing balance funded so demo purchases aren't declined for insufficient funds.
 * Failures are logged and leave the card on the mock network rather than failing the seed.
 */
export async function syncSeededCardsToStripe(log: (s: string) => void = () => {}) {
  if (env.issuingMode !== "stripe") return;
  const db = getDb();
  const s = getStripe();
  try {
    const bal = await s.balance.retrieve();
    const eur = bal.issuing?.available.find((b) => b.currency === "eur")?.amount ?? 0;
    if (eur < ISSUING_FLOAT_CENTS) {
      await s.rawRequest("POST", "/v1/test_helpers/issuing/fund_balance", { amount: 5_000_000, currency: "eur" });
      log(`funded sandbox Issuing balance (was ${fmtEur(eur)})`);
    }
  } catch (err) {
    log(`could not fund Issuing balance: ${err instanceof Error ? err.message : err}`);
  }

  const known = new Set(
    (db.prepare(`SELECT stripe_card_id FROM card WHERE network='stripe' AND stripe_card_id IS NOT NULL`).all() as { stripe_card_id: string }[]).map(
      (r) => r.stripe_card_id,
    ),
  );
  const stale: string[] = [];
  for (const status of ["active", "inactive"] as const) {
    for await (const c of s.issuing.cards.list({ status, limit: 100 })) {
      if (c.metadata?.balance_env === "sandbox" && !known.has(c.id)) stale.push(c.id);
    }
  }
  await inBatches(stale, (id) => s.issuing.cards.update(id, { status: "canceled" }).then(() => undefined));
  if (stale.length) log(`cancelled ${stale.length} Stripe cards from earlier seeds`);

  const rows = db
    .prepare(`SELECT id, society_id, member_id, status, per_auth_cap_cents, monthly_limit_cents FROM card WHERE network='mock' AND status != 'canceled'`)
    .all() as (Pick<CardRecord, "id" | "society_id" | "member_id" | "status" | "per_auth_cap_cents" | "monthly_limit_cents">)[];
  let issued = 0;
  await inBatches(rows, async (row) => {
    try {
      const member = db.prepare(`SELECT * FROM member WHERE id=?`).get(row.member_id) as MemberRow;
      const chId = await stripeNetwork.ensureCardholder(member);
      db.prepare(`UPDATE member SET stripe_cardholder_id=?, cardholder_created_at=COALESCE(cardholder_created_at, ?) WHERE id=?`).run(chId, nowIso(), member.id);
      const c = await stripeNetwork.createCard(chId, {
        memberId: member.id,
        role: member.role,
        societyId: row.society_id,
        perAuthCapCents: row.per_auth_cap_cents,
        monthlyLimitCents: row.monthly_limit_cents,
      });
      if (row.status === "inactive") await stripeNetwork.setStatus(c.id, "inactive");
      db.prepare(`UPDATE card SET network='stripe', stripe_card_id=?, last4=?, exp_month=?, exp_year=? WHERE id=?`).run(c.id, c.last4, c.expMonth, c.expYear, row.id);
      issued++;
    } catch (err) {
      log(`card ${row.id} stays simulated: ${err instanceof Error ? err.message : err}`);
    }
  });
  log(`issued ${issued}/${rows.length} seeded cards on Stripe Issuing`);
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>, size = 5) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

interface CardRecord {
  id: string;
  society_id: string;
  member_id: string;
  event_id: string | null;
  network: string;
  stripe_card_id: string | null;
  status: CardStatus;
  per_auth_cap_cents: number;
  monthly_limit_cents: number;
}

function getCard(cardId: string) {
  const card = getDb().prepare(`SELECT * FROM card WHERE id=?`).get(cardId) as CardRecord | undefined;
  if (!card) throw new UserError("not_found", "Card not found", 404);
  return card;
}

/** Live cards count toward the society's allowance; cancelled ones free the slot. */
export function liveCardCount(societyId: string) {
  return (getDb().prepare(`SELECT COUNT(*) n FROM card WHERE society_id=? AND status != 'canceled'`).get(societyId) as { n: number }).n;
}

export function cardCapacity(societyId: string, at = nowIso()) {
  const n = getDb().prepare(`SELECT COUNT(*) n FROM card_slot_purchase WHERE society_id=? AND status='paid' AND expires_at>?`).get(societyId,at) as { n:number };
  return CARDS_PER_SOCIETY+n.n;
}

export function cardHasSlot(cardId:string,societyId:string) {
  const live=getDb().prepare(`SELECT id FROM card WHERE society_id=? AND status!='canceled' ORDER BY created_at,id`).all(societyId) as {id:string}[];
  return live.slice(0,cardCapacity(societyId)).some(c=>c.id===cardId);
}

export function validateLimits(perAuthCapCents: number, monthlyLimitCents: number) {
  if (!Number.isInteger(perAuthCapCents) || perAuthCapCents < 100) throw new UserError("validation", "The per-purchase cap must be at least €1.");
  if (!Number.isInteger(monthlyLimitCents) || monthlyLimitCents < 100) throw new UserError("validation", "The monthly limit must be at least €1.");
  if (perAuthCapCents > monthlyLimitCents) throw new UserError("validation", "The per-purchase cap can't be more than the monthly limit.");
  if (monthlyLimitCents > MAX_MONTHLY_LIMIT_CENTS)
    throw new UserError("validation", `Monthly limits over ${fmtEur(MAX_MONTHLY_LIMIT_CENTS)} need the Societies Office.`);
}

/** Approved spend on a card in the Dublin calendar month containing `at` (holds + captures). */
export function cardMonthSpend(cardId: string, at: string) {
  const month = dublinParts(at).date.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(CASE status WHEN 'pending' THEN amount_cents WHEN 'closed' THEN captured_cents ELSE 0 END),0) v
       FROM authorization WHERE card_id=? AND decision='approved' AND created_at >= ? AND created_at < ?`,
    )
    .get(cardId, dublinToIso(`${month}-01`, "00:00"), dublinToIso(`${next}-01`, "00:00")) as { v: number };
  return r.v;
}

/** Create (or retry) the network card behind a pending card row. On failure it stays "pending" (F10). */
export async function issueCard(cardId: string, actor: string) {
  const db = getDb();
  const pending = getCard(cardId);
  if (pending.status !== "pending") throw new UserError("conflict", "Only a pending card can be issued.", 409);
  const member = db.prepare(`SELECT * FROM member WHERE id=?`).get(pending.member_id) as MemberRow;
  const net = cardNetwork();
  try {
    const chId = await net.ensureCardholder(member);
    if (!member.stripe_cardholder_id || member.stripe_cardholder_id !== chId) {
      db.prepare(`UPDATE member SET stripe_cardholder_id=?, cardholder_created_at=COALESCE(cardholder_created_at, ?) WHERE id=?`).run(
        chId,
        nowIso(),
        member.id,
      );
    }
    const c = await net.createCard(chId, {
      memberId: member.id,
      role: member.role,
      societyId: pending.society_id,
      perAuthCapCents: pending.per_auth_cap_cents,
      monthlyLimitCents: pending.monthly_limit_cents,
    });
    db.prepare(
      `UPDATE card SET network=?, stripe_card_id=?, last4=?, exp_month=?, exp_year=?, status='active', error=NULL WHERE id=?`,
    ).run(net.name, c.id, c.last4, c.expMonth, c.expYear, cardId);
    audit(actor, "card.issued", cardId, { network: net.name, member_id: member.id });
    return { ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(`UPDATE card SET status='pending', error=? WHERE id=?`).run(msg.slice(0, 300), cardId);
    audit(actor, "card.issue_failed", cardId, { error: msg });
    return { ok: false as const, error: msg };
  }
}

export interface NewCardInput {
  societyId: string;
  memberId: string;
  perAuthCapCents: number;
  monthlyLimitCents: number;
  eventId?: string | null;
}

/** Issue an officer card to a committee member (treasurer only, Society Plan required). */
export async function createOfficerCard(input: NewCardInput, actor: string) {
  const db = getDb();
  validateLimits(input.perAuthCapCents, input.monthlyLimitCents);
  const soc = db.prepare(`SELECT plan_status FROM society WHERE id=?`).get(input.societyId) as { plan_status: string } | undefined;
  if (!soc) throw new UserError("unknown_society", "Society not found", 404);
  if (soc.plan_status !== "active") throw new UserError("plan_required", "Subscribe to the Society Plan to issue officer cards.", 402);
  const member = db.prepare(`SELECT id, name, role FROM member WHERE id=? AND society_id=?`).get(input.memberId, input.societyId) as
    | { id: string; name: string; role: string }
    | undefined;
  if (!member) throw new UserError("validation", "Pick a cardholder from your committee.");
  if (["member","senior_treasurer"].includes(member.role)) throw new UserError("validation", "Cards are issued to committee members; ordinary members can submit expenses.");
  if (input.eventId) assertOpenEvent(input.eventId, input.societyId);

  const cardId = newId("card");
  db.transaction(() => {
    if (liveCardCount(input.societyId) >= cardCapacity(input.societyId)) {
      throw new UserError("card_limit", `Your card slots are full. Add a slot for €10 for the remaining plan year, or cancel a card.`);
    }
    const existing = db.prepare(`SELECT id FROM card WHERE member_id=? AND status != 'canceled'`).get(member.id);
    if (existing) throw new UserError("card_exists", `${member.name} already has a card. Each officer holds one.`);
    db.prepare(
      `INSERT INTO card (id, society_id, member_id, event_id, network, last4, exp_month, exp_year, status, per_auth_cap_cents, monthly_limit_cents, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(cardId, input.societyId, member.id, input.eventId ?? null, "mock", "····", 0, 0, "pending", input.perAuthCapCents, input.monthlyLimitCents, nowIso());
  }).immediate();
  audit(actor, "card.created", cardId, { member_id: member.id, role: ROLE_LABEL[member.role] ?? member.role });
  const issued = await issueCard(cardId, actor);
  return { cardId, issued };
}

function assertOpenEvent(eventId: string, societyId: string) {
  const ev = getDb().prepare(`SELECT society_id, status FROM event WHERE id=?`).get(eventId) as { society_id: string; status: string } | undefined;
  if (!ev || ev.society_id !== societyId) throw new UserError("validation", "That event isn't one of your society's events.");
  if (ev.status !== "open") throw new UserError("validation", "That event is closed. Pick an open event.");
}

/** Point a card at an open event (its purchases come out of that budget), or back to general spending. */
export function assignCard(cardId: string, eventId: string | null, actor: string) {
  const card = getCard(cardId);
  if (card.status === "pending") throw new UserError("validation", "Finish issuing or cancel this pending card first.");
  if (card.status === "canceled") throw new UserError("validation", "This card is cancelled.");
  if (eventId) assertOpenEvent(eventId, card.society_id);
  getDb().prepare(`UPDATE card SET event_id=? WHERE id=?`).run(eventId, cardId);
  audit(actor, eventId ? "card.assigned" : "card.unassigned", cardId, { event_id: eventId });
}

export async function updateCardLimits(cardId: string, perAuthCapCents: number, monthlyLimitCents: number, actor: string) {
  validateLimits(perAuthCapCents, monthlyLimitCents);
  const card = getCard(cardId);
  if (card.status === "canceled") throw new UserError("validation", "This card is cancelled.");
  if (card.network === "stripe") await stripeNetwork.setLimits(card.stripe_card_id, perAuthCapCents, monthlyLimitCents);
  getDb().prepare(`UPDATE card SET per_auth_cap_cents=?, monthly_limit_cents=? WHERE id=?`).run(perAuthCapCents, monthlyLimitCents, cardId);
  audit(actor, "card.limits_changed", cardId, { per_auth_cap_cents: perAuthCapCents, monthly_limit_cents: monthlyLimitCents });
}

/** Issue a replacement for a cancelled card: same officer, limits and event. */
export async function replaceCard(cardId: string, actor: string) {
  const old = getCard(cardId);
  if (old.status !== "canceled") throw new UserError("validation", "Only cancelled cards can be replaced.");
  const ev = old.event_id ? (getDb().prepare(`SELECT status FROM event WHERE id=?`).get(old.event_id) as { status: string }) : null;
  return createOfficerCard(
    {
      societyId: old.society_id,
      memberId: old.member_id,
      perAuthCapCents: old.per_auth_cap_cents,
      monthlyLimitCents: old.monthly_limit_cents,
      eventId: ev?.status === "open" ? old.event_id : null,
    },
    actor,
  );
}

export async function setCardStatus(cardId: string, status: Exclude<CardStatus, "pending">, reason: string, actor: string) {
  const db = getDb();
  const card = db.prepare(`SELECT * FROM card WHERE id=?`).get(cardId) as
    | { id: string; society_id: string; status: CardStatus; stripe_card_id: string | null; network: string }
    | undefined;
  if (!card) throw new UserError("not_found", "Card not found", 404);
  if (card.status === "canceled") throw new UserError("card_canceled", "This card is cancelled and can't be changed.");
  if (status === "active") {
    if(card.status === "pending") throw new UserError("validation","Issue the pending card before activating it.");
    if (!cardHasSlot(cardId,card.society_id)) throw new UserError("card_limit","This extra card slot has expired. Buy a slot or cancel another card.");
    const soc = db.prepare(`SELECT plan_status FROM society WHERE id=?`).get(card.society_id) as { plan_status: string };
    if (soc.plan_status !== "active") throw new UserError("plan_required", "Renew the Society Plan to use your officer cards again.", 402);
  }
  if (card.network === "stripe") await stripeNetwork.setStatus(card.stripe_card_id, status);
  db.prepare(`UPDATE card SET status=?, status_reason=? WHERE id=?`).run(status, reason, cardId);
  audit(actor, `card.${status === "active" ? "unfrozen" : status === "inactive" ? "frozen" : "canceled"}`, cardId, { reason });
}

export const PLAN_LAPSED_REASON = "Society Plan expired";

/** Plan lapsed: freeze every active card until the society renews. */
export async function suspendPlanCards(societyId: string, actor: string) {
  const cards = getDb().prepare(`SELECT id FROM card WHERE society_id=? AND status='active'`).all(societyId) as { id: string }[];
  for (const c of cards) await setCardStatus(c.id, "inactive", PLAN_LAPSED_REASON, actor);
}

/** Plan renewed: wake the cards that were frozen only because the plan lapsed. */
export async function reactivatePlanCards(societyId: string, actor: string) {
  const cards = getDb()
    .prepare(`SELECT id FROM card WHERE society_id=? AND status='inactive' AND status_reason=?`)
    .all(societyId, PLAN_LAPSED_REASON) as { id: string }[];
  for (const c of cards) if(cardHasSlot(c.id,societyId)) await setCardStatus(c.id, "active", "Society Plan renewed", actor);
  return cards.length;
}
