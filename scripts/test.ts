import fs from "node:fs";

process.env.BALANCE_DB_PATH = "data/test.db";
process.env.BALANCE_TEST_MODE = "1";
for (const file of ["data/test.db", "data/test.db-wal", "data/test.db-shm"]) fs.rmSync(file, { force: true });

interface Result {
  id: string;
  kind: "Ordinary" | "Boundary" | "Failure" | "Invariant";
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

async function main() {
  const { seed } = await import("../src/lib/seed");
  const { getDb } = await import("../src/lib/db");
  const {
    createOfficerCard,
    setCardNetworkForTests,
    setCardStatus,
    stripeSpendingControls,
    updateCardLimits,
  } = await import("../src/lib/cards");
  const { decideAuthorization, releaseAuthorization } = await import("../src/lib/authorize");
  const { createTopUpCheckout, fulfilTopUp } = await import("../src/lib/payments");
  const { postEntry, societyBalances } = await import("../src/lib/ledger");
  const { dublinToIso } = await import("../src/lib/money");
  const { env } = await import("../src/lib/env");
  env.stripeSecretKey = "";

  let cardCounter = 0;
  let controlsUpdates = 0;
  setCardNetworkForTests({
    name: "stripe",
    async ensureCardholder(member) {
      return member.stripe_cardholder_id ?? `test_ich_${member.id}`;
    },
    async createCard() {
      cardCounter += 1;
      return { id: `test_ic_${cardCounter}`, last4: String(9000 + cardCounter), expMonth: 10, expYear: 2030 };
    },
    async setStatus() {},
    async setControls() {
      controlsUpdates += 1;
    },
  });

  const results: Result[] = [];
  const check = (id: string, kind: Result["kind"], name: string, expected: string, actual: string, pass: boolean) => {
    results.push({ id, kind, name, expected, actual, pass });
    console.log(`${pass ? "✓" : "✗"} ${id.padEnd(4)} ${name} → ${actual}`);
  };

  const summary = await seed();
  const db = getDb();
  const societies = db.prepare(`SELECT id,name FROM society ORDER BY id`).all() as { id: string; name: string }[];
  const initialCards = (db.prepare(`SELECT COUNT(*) count FROM card`).get() as { count: number }).count;
  const linkedMembers = (db.prepare(`SELECT COUNT(*) count FROM member WHERE stripe_cardholder_id IS NOT NULL`).get() as { count: number }).count;
  const openingBalance = societyBalances("soc_drama").available;
  check("S1", "Invariant", "Only Drama Society is seeded", "One society: UCD Drama Society", societies.map((s) => s.name).join(", "), summary.societies === 1 && societies.length === 1 && societies[0]?.id === "soc_drama");
  check("S2", "Invariant", "No cards are seeded", "0 cards", `${initialCards} cards`, initialCards === 0);
  check("S3", "Invariant", "No synthetic Stripe identities are seeded", "0 linked members", `${linkedMembers} linked members`, linkedMembers === 0);
  check("S4", "Invariant", "Drama starts with no money", "€0.00", `€${(openingBalance / 100).toFixed(2)}`, openingBalance === 0);

  const orla = await createOfficerCard(
    {
      societyId: "soc_drama",
      memberId: "mem_drama_5",
      perAuthCapCents: 20_000,
      monthlyLimitCents: 50_000,
      restrictionProfile: "standard",
    },
    "test",
  );
  const orlaRow = db.prepare(`SELECT network,stripe_card_id,last4,status FROM card WHERE id=?`).get(orla.cardId) as {
    network: string;
    stripe_card_id: string | null;
    last4: string;
    status: string;
  };
  check("C1", "Ordinary", "A site-issued card stores its network projection", "Active Stripe card", `${orlaRow.network}/${orlaRow.status}/••${orlaRow.last4}`, orla.issued.ok && orlaRow.network === "stripe" && Boolean(orlaRow.stripe_card_id) && orlaRow.status === "active");

  let duplicateRejected = false;
  try {
    await createOfficerCard({ societyId: "soc_drama", memberId: "mem_drama_5", perAuthCapCents: 20_000, monthlyLimitCents: 50_000 }, "test");
  } catch {
    duplicateRejected = true;
  }
  check("C2", "Invariant", "An officer can hold only one live card", "Duplicate rejected", duplicateRejected ? "Rejected" : "Accepted", duplicateRejected);

  postEntry({ societyId: "soc_drama", type: "topup", amountCents: 100_000, refType: "test", refId: "authorization-funds", at: dublinToIso(new Date().toISOString().slice(0, 10), "08:30") });

  const today = new Date().toISOString().slice(0, 10);
  const at = (minute: number) => dublinToIso(today, `09:${String(minute).padStart(2, "0")}`);
  const exact = decideAuthorization({ cardId: orla.cardId, amountCents: 20_000, merchantName: "LIMIT EXACT", mcc: "5814", merchantCountry: "IE", at: at(0) });
  if (exact.authorizationId) releaseAuthorization(exact.authorizationId);
  const over = decideAuthorization({ cardId: orla.cardId, amountCents: 20_001, merchantName: "LIMIT OVER", mcc: "5814", merchantCountry: "IE", at: at(1) });
  check("C3", "Boundary", "Per-purchase limit is hard", "€200 approved; €200.01 declined", `${exact.approved}/${over.declineCode}`, exact.approved && !over.approved && over.declineCode === "spending_controls");

  const monthParts = [20_000, 20_000, 10_000].map((amount, index) => decideAuthorization({
    cardId: orla.cardId,
    amountCents: amount,
    merchantName: `MONTH ${index}`,
    mcc: "5814",
    merchantCountry: "IE",
    at: at(10 + index),
  }));
  const overMonth = decideAuthorization({ cardId: orla.cardId, amountCents: 1, merchantName: "MONTH OVER", mcc: "5814", merchantCountry: "IE", at: at(13) });
  check("C4", "Boundary", "Monthly limit is hard", "€500 approved; next cent declined", `${monthParts.every((p) => p.approved)}/${overMonth.declineCode}`, monthParts.every((p) => p.approved && !overMonth.approved) && overMonth.declineCode === "spending_controls");
  for (const purchase of monthParts) if (purchase.authorizationId) releaseAuthorization(purchase.authorizationId);

  await updateCardLimits(orla.cardId, 20_000, 50_000, "test", "event_essentials");
  const pizza = decideAuthorization({ cardId: orla.cardId, amountCents: 1_840, merchantName: "PIZZA", mcc: "5814", merchantCountry: "IE", at: at(20) });
  const consolePurchase = decideAuthorization({ cardId: orla.cardId, amountCents: 14_999, merchantName: "CONSOLE", mcc: "5945", merchantCountry: "IE", at: at(21) });
  check("C5", "Invariant", "Event essentials is an allowlist", "Pizza approved; game shop declined", `${pizza.approved}/${consolePurchase.declineCode}`, pizza.approved && !consolePurchase.approved && consolePurchase.declineCode === "blocked_card_profile");
  if (pizza.authorizationId) releaseAuthorization(pizza.authorizationId);
  check("C6", "Invariant", "Control changes reach the card network", "One network update", `${controlsUpdates} updates`, controlsUpdates === 1);

  const stripeControls = stripeSpendingControls({ perAuthCapCents: 20_000, monthlyLimitCents: 50_000, restrictionProfile: "trip" });
  check(
    "C7",
    "Invariant",
    "Stripe controls mirror both hard limits",
    "per_authorization=20000 and monthly=50000",
    JSON.stringify(stripeControls.spending_limits),
    stripeControls.spending_limits.some((limit) => limit.interval === "per_authorization" && limit.amount === 20_000) &&
      stripeControls.spending_limits.some((limit) => limit.interval === "monthly" && limit.amount === 50_000),
  );

  const before = societyBalances("soc_drama").available;
  const checkout = await createTopUpCheckout({ societySlug: "drama", amountCents: 25_000, payerName: "Test sponsor" });
  const session = (db.prepare(`SELECT checkout_session_id id FROM topup WHERE id=?`).get(checkout.topupId) as { id: string }).id;
  fulfilTopUp(session, "test");
  fulfilTopUp(session, "test-retry");
  const after = societyBalances("soc_drama").available;
  check("P1", "Invariant", "Top-up fulfillment is idempotent", "Balance increases exactly €250", `+€${(after - before) / 100}`, after - before === 25_000);

  await setCardStatus(orla.cardId, "canceled", "test cleanup", "test");
  setCardNetworkForTests(null);
  env.stripeSecretKey = "";
  const unavailable = await createOfficerCard(
    { societyId: "soc_drama", memberId: "mem_drama_5", perAuthCapCents: 5_000, monthlyLimitCents: 10_000 },
    "test",
  );
  const pending = db.prepare(`SELECT status,error,network,stripe_card_id FROM card WHERE id=?`).get(unavailable.cardId) as {
    status: string;
    error: string | null;
    network: string;
    stripe_card_id: string | null;
  };
  check("F1", "Failure", "Missing Stripe never creates a local substitute", "Pending Stripe request with a clear error", `${pending.status}/${pending.network}/${pending.stripe_card_id ?? "no card"}`, !unavailable.issued.ok && pending.status === "pending" && pending.network === "stripe" && pending.stripe_card_id === null && Boolean(pending.error));

  await seed();
  const finalSocieties = (db.prepare(`SELECT COUNT(*) count FROM society`).get() as { count: number }).count;
  const finalCards = (db.prepare(`SELECT COUNT(*) count FROM card`).get() as { count: number }).count;
  const finalBalance = societyBalances("soc_drama").available;
  check("S5", "Invariant", "Reset returns to the clean Stripe-only baseline", "1 society, 0 cards and €0", `${finalSocieties} society, ${finalCards} cards, €${(finalBalance / 100).toFixed(2)}`, finalSocieties === 1 && finalCards === 0 && finalBalance === 0);

  const passed = results.filter((result) => result.pass).length;
  fs.writeFileSync("data/test-results.json", JSON.stringify({ generated_at: new Date().toISOString(), passed, total: results.length, results }, null, 2) + "\n");
  console.log(`\n${passed}/${results.length} checks passed`);
  db.close();
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
