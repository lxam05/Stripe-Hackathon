import type Stripe from "stripe";
import { env } from "./env";
import { audit, getDb, newId, nowIso } from "./db";
import { dublinParts, dublinToIso, fmtEur } from "./money";
import { UserError } from "./errors";
import { globalBlockedMccs } from "./policy";
import { CARDS_PER_SOCIETY, defaultLimits, MAX_MONTHLY_LIMIT_CENTS, ROLE_LABEL } from "./roles";
import { getStripe } from "./stripe";
import {
  isCardRestrictionProfile,
  stripeCategoryControls,
  type CardRestrictionProfile,
} from "./card-restrictions";

// Officer cards. Each society gets up to CARDS_PER_SOCIETY live cards, one per committee
// member. A card can point at one open event at a time; purchases then come out of that
// event's budget. Unassigned cards spend from the society's unallocated money.
//
// Stripe Issuing is the card system of record. The database contains a local
// projection for authorization, ledger and ownership checks; it never invents
// card details for the product UI.

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
  localCardId: string;
  memberId: string;
  role: string;
  societyId: string;
  perAuthCapCents: number;
  monthlyLimitCents: number;
  restrictionProfile: CardRestrictionProfile;
}

export interface CardNetwork {
  name: "stripe" | "test";
  ensureCardholder(m: MemberRow): Promise<string>;
  createCard(cardholderId: string, p: IssueParams): Promise<{ id: string; last4: string; expMonth: number; expYear: number }>;
  setStatus(stripeCardId: string | null, status: Exclude<CardStatus, "pending">): Promise<void>;
  setControls(stripeCardId: string | null, p: Pick<IssueParams, "perAuthCapCents" | "monthlyLimitCents" | "restrictionProfile">): Promise<void>;
}

// EU cards need a phone on the cardholder for 3-D Secure; members don't store one, so the
// sandbox uses the UCD switchboard.
const SANDBOX_CARDHOLDER_PHONE = "+35317167777";
const SITE_CARD_ORIGIN = "balance_site";

export function stripeSpendingControls(p: { perAuthCapCents: number; monthlyLimitCents: number; restrictionProfile: CardRestrictionProfile }) {
  return {
    ...stripeCategoryControls(p.restrictionProfile, globalBlockedMccs()),
    spending_limits: [
      { amount: p.perAuthCapCents, interval: "per_authorization" as const },
      { amount: p.monthlyLimitCents, interval: "monthly" as const },
    ],
  };
}

const stripeNetwork: CardNetwork = {
  name: "stripe",
  // One cardholder per person: new and replacement cards reuse it.
  async ensureCardholder(m) {
    if (m.stripe_cardholder_id) return m.stripe_cardholder_id;
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
      metadata: { member_id: m.id, balance_origin: SITE_CARD_ORIGIN },
    });
    return ch.id;
  },
  async createCard(cardholderId, p) {
    const card = await getStripe().issuing.cards.create({
      cardholder: cardholderId,
      currency: "eur",
      type: "virtual",
      status: "active",
      spending_controls: stripeSpendingControls(p),
      metadata: {
        balance_origin: SITE_CARD_ORIGIN,
        local_card_id: p.localCardId,
        society_id: p.societyId,
        member_id: p.memberId,
        role: p.role,
        restriction_profile: p.restrictionProfile,
      },
    });
    return { id: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
  },
  async setStatus(stripeCardId, status) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, { status });
  },
  async setControls(stripeCardId, p) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, {
      spending_controls: stripeSpendingControls(p),
      metadata: { restriction_profile: p.restrictionProfile },
    });
  },
};

let testNetwork: CardNetwork | null = null;

/** Test-only dependency injection; production can never select a mock adapter. */
export function setCardNetworkForTests(network: CardNetwork | null) {
  if (process.env.BALANCE_TEST_MODE !== "1") throw new Error("Card network overrides are test-only.");
  testNetwork = network;
}

export const cardNetwork = (): CardNetwork => {
  if (testNetwork) return testNetwork;
  if (!env.stripeSecretKey) {
    throw new UserError("stripe_required", "Stripe Issuing is required to create or manage cards. Add a sandbox STRIPE_SECRET_KEY.", 503);
  }
  return stripeNetwork;
};

function cardholderId(cardholder: string | Stripe.Issuing.Cardholder) {
  return typeof cardholder === "string" ? cardholder : cardholder.id;
}

function remoteLimits(card: Stripe.Issuing.Card, role: string) {
  const fallback = defaultLimits(role);
  const limits = card.spending_controls?.spending_limits ?? [];
  return {
    perAuthCapCents: limits.find((limit) => limit.interval === "per_authorization")?.amount ?? fallback.perAuthCapCents,
    monthlyLimitCents: limits.find((limit) => limit.interval === "monthly")?.amount ?? fallback.monthlyLimitCents,
  };
}

/** Refresh the local projection from cards created by this site in Stripe. */
export async function syncSocietyCardsFromStripe(societyId: string) {
  if (!env.stripeSecretKey) throw new UserError("stripe_required", "Stripe Issuing is not configured.", 503);
  const db = getDb();
  const remote: Stripe.Issuing.Card[] = [];
  for await (const card of getStripe().issuing.cards.list({ limit: 100 })) {
    if (card.metadata?.balance_origin === SITE_CARD_ORIGIN && card.metadata?.society_id === societyId) remote.push(card);
  }

  const seen = new Set<string>();
  const upsert = db.transaction((cards: Stripe.Issuing.Card[]) => {
    for (const card of cards) {
      const memberId = card.metadata?.member_id;
      if (!memberId) continue;
      const member = db.prepare(`SELECT id, role FROM member WHERE id=? AND society_id=?`).get(memberId, societyId) as
        | { id: string; role: string }
        | undefined;
      if (!member) continue;
      const localId = card.metadata?.local_card_id || `card_${card.id}`;
      const local = db.prepare(`SELECT id FROM card WHERE stripe_card_id=? OR id=?`).get(card.id, localId) as { id: string } | undefined;
      seen.add(card.id);
      // Cards cancelled in earlier demo runs stay out of a fresh database.
      if (!local && card.status === "canceled") continue;
      const profile = isCardRestrictionProfile(card.metadata?.restriction_profile) ? card.metadata.restriction_profile : "standard";
      const limits = remoteLimits(card, member.role);
      if (local) {
        db.prepare(
          `UPDATE card SET network='stripe', stripe_card_id=?, last4=?, exp_month=?, exp_year=?, status=?,
             per_auth_cap_cents=?, monthly_limit_cents=?, restriction_profile=?, error=NULL WHERE id=?`,
        ).run(card.id, card.last4, card.exp_month, card.exp_year, card.status, limits.perAuthCapCents, limits.monthlyLimitCents, profile, local.id);
      } else {
        db.prepare(
          `INSERT INTO card (id, society_id, member_id, event_id, network, stripe_card_id, last4, exp_month, exp_year, status,
             per_auth_cap_cents, monthly_limit_cents, restriction_profile, created_at)
           VALUES (?,?,?,NULL,'stripe',?,?,?,?,?,?,?,?,?)`,
        ).run(localId, societyId, memberId, card.id, card.last4, card.exp_month, card.exp_year, card.status, limits.perAuthCapCents, limits.monthlyLimitCents, profile, new Date(card.created * 1000).toISOString());
      }
      db.prepare(`UPDATE member SET stripe_cardholder_id=?, cardholder_created_at=COALESCE(cardholder_created_at, ?) WHERE id=?`).run(
        cardholderId(card.cardholder),
        new Date(card.created * 1000).toISOString(),
        memberId,
      );
    }
  });
  upsert(remote);

  const localStripe = db.prepare(`SELECT id,stripe_card_id FROM card WHERE society_id=? AND network='stripe' AND stripe_card_id IS NOT NULL`).all(societyId) as
    { id: string; stripe_card_id: string }[];
  for (const card of localStripe) {
    if (!seen.has(card.stripe_card_id)) {
      db.prepare(`UPDATE card SET status='canceled', status_reason='Not a card created through Balance' WHERE id=?`).run(card.id);
    }
  }
  return { cards: remote.length };
}

/** Cancel legacy cards produced by the old seed-to-Stripe migration. */
export async function cancelLegacySeededStripeCards() {
  if (!env.stripeSecretKey) throw new UserError("stripe_required", "Stripe Issuing is not configured.", 503);
  const ids: string[] = [];
  for await (const card of getStripe().issuing.cards.list({ limit: 100 })) {
    if (card.status !== "canceled" && card.metadata?.balance_env === "sandbox" && card.metadata?.balance_origin !== SITE_CARD_ORIGIN) ids.push(card.id);
  }
  for (const id of ids) await getStripe().issuing.cards.update(id, { status: "canceled" });
  return ids.length;
}

/** Drama's treasurer: the one officer whose card exists before the demo starts. */
export const DEMO_TREASURER_ID = "mem_drama_1";

/**
 * Demo empty state on the shared sandbox: exactly one live site-issued card in the society, the
 * treasurer's (her oldest is reused, and created only if she has none). Every other live card,
 * such as the events officer's from a previous run, is cancelled so it can be issued live again.
 * Call after seeding; the local projection is then refreshed from Stripe.
 */
export async function resetDemoCards(societyId: string, log: (s: string) => void = () => {}) {
  if (!env.stripeSecretKey) throw new UserError("stripe_required", "Stripe Issuing is not configured.", 503);
  const s = getStripe();
  const live: Stripe.Issuing.Card[] = [];
  for (const status of ["active", "inactive"] as const) {
    for await (const c of s.issuing.cards.list({ status, limit: 100 })) {
      if (c.metadata?.balance_origin === SITE_CARD_ORIGIN && c.metadata?.society_id === societyId) live.push(c);
    }
  }
  const keep = live.filter((c) => c.metadata?.member_id === DEMO_TREASURER_ID).sort((a, b) => a.created - b.created)[0];
  const cancel = live.filter((c) => c.id !== keep?.id);
  for (const c of cancel) await s.issuing.cards.update(c.id, { status: "canceled" });
  if (cancel.length) log(`cancelled ${cancel.length} earlier demo card${cancel.length === 1 ? "" : "s"} in Stripe`);
  if (keep && keep.status !== "active") await s.issuing.cards.update(keep.id, { status: "active" });

  if (keep) {
    await syncSocietyCardsFromStripe(societyId);
    log(`treasurer's card ••${keep.last4} reused from Stripe`);
    return;
  }
  const limits = defaultLimits("treasurer");
  const r = await createOfficerCard(
    { societyId, memberId: DEMO_TREASURER_ID, perAuthCapCents: limits.perAuthCapCents, monthlyLimitCents: limits.monthlyLimitCents, restrictionProfile: "standard" },
    "demo-prepare",
  );
  if (!r.issued.ok) throw new UserError("card_issue_failed", `Stripe did not create the treasurer's card: ${r.issued.error}`, 502);
  log("issued the treasurer's card in Stripe");
}

/** A card's number, expiry and CVC from Stripe, for its cardholder to pay online with. Sandbox only (env.ts refuses live keys). */
export async function stripeCardDetails(cardId: string) {
  const row = getDb().prepare(`SELECT stripe_card_id FROM card WHERE id=? AND network='stripe' AND stripe_card_id IS NOT NULL`).get(cardId) as
    | { stripe_card_id: string }
    | undefined;
  if (!row || !env.stripeSecretKey) return null;
  const c = await getStripe().issuing.cards.retrieve(row.stripe_card_id, { expand: ["number", "cvc"] });
  return { number: c.number ?? "", cvc: c.cvc ?? "", expMonth: c.exp_month, expYear: c.exp_year };
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
  restriction_profile: CardRestrictionProfile;
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
  try {
    const net = cardNetwork();
    const chId = await net.ensureCardholder(member);
    if (!member.stripe_cardholder_id || member.stripe_cardholder_id !== chId) {
      db.prepare(`UPDATE member SET stripe_cardholder_id=?, cardholder_created_at=COALESCE(cardholder_created_at, ?) WHERE id=?`).run(
        chId,
        nowIso(),
        member.id,
      );
    }
    const c = await net.createCard(chId, {
      localCardId: cardId,
      memberId: member.id,
      role: member.role,
      societyId: pending.society_id,
      perAuthCapCents: pending.per_auth_cap_cents,
      monthlyLimitCents: pending.monthly_limit_cents,
      restrictionProfile: pending.restriction_profile,
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
  restrictionProfile?: CardRestrictionProfile;
  eventId?: string | null;
}

/** Issue an officer card to a committee member (treasurer only, Society Plan required). */
export async function createOfficerCard(input: NewCardInput, actor: string) {
  const db = getDb();
  validateLimits(input.perAuthCapCents, input.monthlyLimitCents);
  const restrictionProfile = input.restrictionProfile ?? "standard";
  if (!isCardRestrictionProfile(restrictionProfile)) throw new UserError("validation", "Choose a valid card spending profile.");
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
      `INSERT INTO card (id, society_id, member_id, event_id, network, last4, exp_month, exp_year, status, per_auth_cap_cents, monthly_limit_cents, restriction_profile, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(cardId, input.societyId, member.id, input.eventId ?? null, "stripe", "····", 0, 0, "pending", input.perAuthCapCents, input.monthlyLimitCents, restrictionProfile, nowIso());
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

export async function updateCardLimits(
  cardId: string,
  perAuthCapCents: number,
  monthlyLimitCents: number,
  actor: string,
  restrictionProfile?: CardRestrictionProfile,
) {
  validateLimits(perAuthCapCents, monthlyLimitCents);
  const card = getCard(cardId);
  const profile = restrictionProfile ?? card.restriction_profile;
  if (!isCardRestrictionProfile(profile)) throw new UserError("validation", "Choose a valid card spending profile.");
  if (card.status === "canceled") throw new UserError("validation", "This card is cancelled.");
  if (card.network === "stripe") {
    await cardNetwork().setControls(card.stripe_card_id, { perAuthCapCents, monthlyLimitCents, restrictionProfile: profile });
  }
  getDb().prepare(`UPDATE card SET per_auth_cap_cents=?, monthly_limit_cents=?, restriction_profile=? WHERE id=?`).run(
    perAuthCapCents,
    monthlyLimitCents,
    profile,
    cardId,
  );
  audit(actor, "card.controls_changed", cardId, {
    per_auth_cap_cents: perAuthCapCents,
    monthly_limit_cents: monthlyLimitCents,
    restriction_profile: profile,
  });
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
      restrictionProfile: old.restriction_profile,
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
  if (card.network === "stripe") await cardNetwork().setStatus(card.stripe_card_id, status);
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
