import { getDb } from "./db";

/** A conservative fallback when the network supplies no stable merchant identifier. */
export function merchantKey(name: string, mcc: string, country: string, networkId?: string) {
  return networkId ? `network:${networkId}` : `descriptor:${name.trim().toLowerCase().replace(/\s+/g," ")}|${mcc}|${country.toUpperCase()}`;
}
export function recordPaymentReview(a: { id: string; societyId: string; memberId: string; key: string; amount: number; currency: string; at: string; exception: boolean; reason: string }) {
  const db=getDb();
  const candidates=db.prepare(`SELECT * FROM recurring_mandate WHERE society_id=? AND member_id=? AND merchant_key=? AND currency=? AND status='active' AND min_cents<=? AND max_cents>=? AND starts_at<=? AND ends_at>=?`).all(a.societyId,a.memberId,a.key,a.currency,a.amount,a.amount,a.at,a.at) as { id: string; cadence: string; last_used_at: string }[];
  const matched=candidates.find(m=>{
    const days=(Date.parse(a.at)-Date.parse(m.last_used_at))/86400000;
    const [low,high]=m.cadence === "weekly" ? [6,8] : m.cadence === "monthly" ? [25,35] : [350,380];
    return days>=low && days<=high;
  });
  // Consume a cadence slot even when an exception forces review: a duplicate must never bypass review.
  if (matched) db.prepare(`UPDATE recurring_mandate SET last_used_at=? WHERE id=?`).run(a.at,matched.id);
  const automatic=Boolean(matched && !a.exception);
  db.prepare(`INSERT INTO payment_review(authorization_id,status,reason,mandate_id) VALUES(?,?,?,?)`).run(a.id,automatic ? "recurring_approved" : "pending",automatic ? "Matches an approved recurring mandate" : a.reason || "First-time or unmatched payment — treasurer review required",matched?.id ?? null);
}
