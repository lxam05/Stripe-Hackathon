import type Stripe from "stripe";
import { env } from "./env";
import { audit, getDb, newId, nowIso } from "./db";
import { mccInfo } from "./mcc";
import { globalBlockedMccs } from "./policy";
import { getStripe } from "./stripe";

// CardNetworkAdapter (PRD §13.2). MockAdapter produces the same card objects and
// authorisation events locally, so the risk / ledger / JEV demo works even if
// Stripe Issuing isn't enabled on the sandbox account.

export type CardStatus = "pending" | "active" | "inactive" | "canceled";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  stripe_cardholder_id: string | null;
  cardholder_created_at: string | null;
}

interface IssueParams {
  eventId: string;
  memberId: string;
  budgetCents: number;
  perAuthCapCents: number;
  societyId: string;
}

interface CardNetwork {
  name: "mock" | "stripe";
  ensureCardholder(m: MemberRow): Promise<string>;
  createCard(cardholderId: string, p: IssueParams): Promise<{ id: string; last4: string; expMonth: number; expYear: number }>;
  setStatus(stripeCardId: string | null, status: Exclude<CardStatus, "pending">): Promise<void>;
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
};

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
        spending_limits: [
          { amount: p.budgetCents, interval: "all_time" },
          { amount: p.perAuthCapCents, interval: "per_authorization" },
        ],
        blocked_categories: blocked,
      },
      metadata: { society_id: p.societyId, event_id: p.eventId, balance_env: "sandbox" },
    });
    return { id: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
  },
  async setStatus(stripeCardId, status) {
    if (!stripeCardId) return;
    await getStripe().issuing.cards.update(stripeCardId, { status });
  },
};

export const cardNetwork = (): CardNetwork => (env.issuingMode === "stripe" ? stripeNetwork : mockNetwork);

/** Create (or retry) the network card behind a pending card row. On failure it stays "pending" (F10). */
export async function issueCard(cardId: string, actor: string) {
  const db = getDb();
  const pending = db.prepare(`SELECT * FROM card WHERE id=?`).get(cardId) as {
    event_id: string;
    member_id: string;
    per_auth_cap_cents: number;
  };
  const eventId = pending.event_id;
  const ev = db.prepare(`SELECT * FROM event WHERE id=?`).get(eventId) as {
    id: string;
    society_id: string;
    budget_cents: number;
  };
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
      eventId,
      memberId: member.id,
      budgetCents: ev.budget_cents,
      perAuthCapCents: pending.per_auth_cap_cents,
      societyId: ev.society_id,
    });
    db.prepare(
      `UPDATE card SET network=?, stripe_card_id=?, last4=?, exp_month=?, exp_year=?, status='active', error=NULL WHERE id=?`,
    ).run(net.name, c.id, c.last4, c.expMonth, c.expYear, cardId);
    audit(actor, "card.issued", cardId, { network: net.name, event_id: eventId });
    return { ok: true as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.prepare(`UPDATE card SET status='pending', error=? WHERE id=?`).run(msg.slice(0, 300), cardId);
    audit(actor, "card.issue_failed", cardId, { error: msg });
    return { ok: false as const, error: msg };
  }
}

export async function setCardStatus(cardId: string, status: Exclude<CardStatus, "pending">, reason: string, actor: string) {
  const db = getDb();
  const card = db.prepare(`SELECT * FROM card WHERE id=?`).get(cardId) as
    | { id: string; status: CardStatus; stripe_card_id: string | null; network: string }
    | undefined;
  if (!card) throw new Error("Card not found");
  if (card.status === "canceled") throw new Error("This card is cancelled and can't be changed.");
  if (card.network === "stripe") await stripeNetwork.setStatus(card.stripe_card_id, status);
  db.prepare(`UPDATE card SET status=?, status_reason=? WHERE id=?`).run(status, reason, cardId);
  audit(actor, `card.${status === "active" ? "unfrozen" : status === "inactive" ? "frozen" : "canceled"}`, cardId, { reason });
}
