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

const spendingLimits = (perAuthCapCents: number, monthlyLimitCents: number) => [
  { amount: monthlyLimitCents, interval: "monthly" as const },
  { amount: perAuthCapCents, interval: "per_authorization" as const },
];

const stripeNetwork: CardNetwork = {
  name: "stripe",
  async ensureCardholder(m) {
    if (m.stripe_cardholder_id && !m.stripe_cardholder_id.startsWith("mock_")) return m.stripe_cardholder_id;
    const [first, ...rest] = m.name.replace(/\s*\(demo\)\s*/i, "").split(" ");
    const ch = await getStripe().issuing.cardholders.create({
      type: "individual",
      name: m.name.replace(/\s*\(demo\)\s*/i, ""),
      email: m.email,
      billing: { address: { line1: "UCD Student Centre, Belfield", city: "Dublin", postal_code: "D04 V1W8", country: "IE" } },
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
        spending_limits: spendingLimits(p.perAuthCapCents, p.monthlyLimitCents),
        blocked_categories: blocked,
      },
      metadata: { society_id: p.societyId, member_id: p.memberId, role: p.role, balance_env: "sandbox" },
    });
    return { id: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
  },
  async setStatus(stripeCardId, status) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, { status });
  },
  async setLimits(stripeCardId, perAuthCapCents, monthlyLimitCents) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, {
      spending_controls: { spending_limits: spendingLimits(perAuthCapCents, monthlyLimitCents) },
    });
  },
};

export const cardNetwork = (): CardNetwork => (env.issuingMode === "stripe" ? stripeNetwork : mockNetwork);

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
  if (input.eventId) assertOpenEvent(input.eventId, input.societyId);

  const cardId = newId("card");
  db.transaction(() => {
    if (liveCardCount(input.societyId) >= CARDS_PER_SOCIETY) {
      throw new UserError("card_limit", `The Society Plan includes ${CARDS_PER_SOCIETY} officer cards. Cancel one to free a slot.`);
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
  for (const c of cards) await setCardStatus(c.id, "active", "Society Plan renewed", actor);
  return cards.length;
}
