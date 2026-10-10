import { assessAuthorization } from "./assess";
import { getDb } from "./db";
import { seed } from "./seed";

export async function prepareDemo(log: (message: string) => void = () => {}) {
  await seed({ log });
  const db = getDb();
  const purchase = db.prepare(
    `SELECT id FROM authorization WHERE card_id='card_drama_2' AND merchant_name='GAMESTOP PS5 CONSOLE' AND amount_cents=14999 ORDER BY created_at DESC LIMIT 1`,
  ).get() as { id: string } | undefined;
  if (!purchase) throw new Error("Demo preparation failed: Cian's GameStop purchase was not created.");

  await assessAuthorization(purchase.id, { actor: "demo-prepare" });
  const assessment = db.prepare(
    `SELECT source,status,risk_level,summary FROM risk_assessment WHERE authorization_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`,
  ).get(purchase.id) as { source: string; status: string; risk_level: string | null; summary: string } | undefined;
  const flag = db.prepare(`SELECT id,status FROM flag WHERE authorization_id=?`).get(purchase.id) as { id: string; status: string } | undefined;
  const review = db.prepare(`SELECT status FROM payment_review WHERE authorization_id=?`).get(purchase.id) as { status: string } | undefined;

  if (!assessment || assessment.source !== "jev" || assessment.status !== "done") {
    throw new Error(`Demo preparation failed: expected a completed source=jev assessment, got ${assessment ? `${assessment.source}/${assessment.status}` : "none"}. Check OPENROUTER_API_KEY and model access.`);
  }
  if (!flag || flag.status !== "open" || review?.status !== "pending") {
    throw new Error(`Demo preparation failed: JEV did not escalate the GameStop purchase for review (risk=${assessment.risk_level ?? "unknown"}). Summary: ${assessment.summary}`);
  }
  log(`ready: ${purchase.id} assessed by JEV (${assessment.risk_level}), review ${review.status}`);
  return { authorizationId: purchase.id, assessment, flag };
}
