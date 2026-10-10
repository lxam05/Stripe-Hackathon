import { z } from "zod";
import { audit, getDb, newId, nowIso } from "./db";
import { assertCouncil, assertReportOwner, assertSociety, assertTreasurer } from "./access";
import { UserError } from "./errors";
import { ROLE_LABEL } from "./roles";
import type { Actor } from "./session";
import { postEntry, societyBalances } from "./ledger";
import { draftGrantNarrative } from "./jev";

const cents = z.number().int().min(1).max(5_000_000);
const person = z.object({ name: z.string().trim().min(1).max(80), email: z.email().max(160) });
export function addMember(actor: Actor, societyId: string, input: unknown) {
  assertTreasurer(actor, societyId);
  const b = person.extend({ role: z.enum(["member", "committee", "auditor", "chair", "secretary", "pro", "events_officer"]) }).parse(input);
  return insertMember(societyId, b.name, b.email, b.role, actor.id);
}
function insertMember(societyId: string, name: string, email: string, role: string, who: string) {
  const db = getDb();
  if (db.prepare(`SELECT id FROM member WHERE society_id=? AND lower(email)=lower(?)`).get(societyId, email)) throw new UserError("duplicate_member", "That email is already a member of this society.");
  const id = newId("mem");
  db.prepare(`INSERT INTO member(id,society_id,name,email,role,member_ref,created_at) VALUES(?,?,?,?,?,?,?)`).run(id, societyId, name, email, role, newId("M"), nowIso());
  audit(who, "member.added", id, { societyId, role });
  return id;
}
export function createSociety(actor: Actor, input: unknown) {
  assertCouncil(actor);
  const b = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60), treasurer: person, senior: person.optional() }).parse(input);
  const db = getDb();
  return db.transaction(() => {
    if (db.prepare(`SELECT id FROM society WHERE slug=?`).get(b.slug)) throw new UserError("duplicate_slug", "Choose a different society slug.");
    const id = newId("soc");
    db.prepare(`INSERT INTO society(id,name,slug,category,icon) VALUES(?,?,?,?,?)`).run(id, b.name, b.slug, "other", "/art/persona-admin.webp");
    insertMember(id, b.treasurer.name, b.treasurer.email, "treasurer", actor.id);
    if (b.senior) insertMember(id, b.senior.name, b.senior.email, "senior_treasurer", actor.id);
    audit(actor.id, "society.created", id);
    return id;
  }).immediate();
}
export function changeLeadership(actor: Actor, societyId: string, input: unknown) {
  assertCouncil(actor);
  const b = z.object({ treasurerId: z.string(), seniorId: z.string().nullable() }).parse(input);
  const db = getDb();
  db.transaction(() => {
    if (b.treasurerId === b.seniorId) throw new UserError("validation", "Choose different people for the two roles.");
    for (const id of [b.treasurerId, b.seniorId].filter(Boolean)) if (!db.prepare(`SELECT id FROM member WHERE id=? AND society_id=?`).get(id, societyId)) throw new UserError("validation", "Choose members of this society.");
    db.prepare(`UPDATE member SET role='committee' WHERE society_id=? AND role IN ('treasurer','senior_treasurer')`).run(societyId);
    db.prepare(`UPDATE member SET role='treasurer' WHERE id=?`).run(b.treasurerId);
    if (b.seniorId) db.prepare(`UPDATE member SET role='senior_treasurer' WHERE id=?`).run(b.seniorId);
    audit(actor.id, "society.leadership_changed", societyId, b);
  }).immediate();
}

export interface ReviewRow {
  authorization_id: string; status: string; reason: string; note: string; mandate_id: string | null;
  society_id: string; member_id: string; merchant_name: string; merchant_key: string; currency: string;
  amount_cents: number; created_at: string; member_name: string; society_name: string;
}
export function listReviews(actor: Actor) {
  return getDb().prepare(`SELECT r.*, a.society_id,a.member_id,a.merchant_name,a.merchant_key,a.currency,a.amount_cents,a.created_at,m.name member_name,s.name society_name
    FROM payment_review r JOIN authorization a ON a.id=r.authorization_id JOIN member m ON m.id=a.member_id JOIN society s ON s.id=a.society_id
    ${actor.kind === "member" ? "WHERE a.society_id=?" + (["treasurer","senior_treasurer"].includes(actor.role) ? "" : " AND a.member_id=?") : ""}
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'receipt_requested' THEN 1 ELSE 2 END, a.created_at DESC LIMIT 150`)
    .all(...(actor.kind === "member" ? [actor.societyId, ...(["treasurer","senior_treasurer"].includes(actor.role) ? [] : [actor.id])] : [])) as ReviewRow[];
}
export function reviewPayment(actor: Actor, authId: string, input: unknown) {
  const b = z.object({ status: z.enum(["approved","misuse","receipt_requested"]), note: z.string().trim().max(1000), mandate: z.object({ minCents: cents, maxCents: cents, cadence: z.enum(["weekly","monthly","yearly"]), endsAt: z.iso.datetime() }).optional() }).parse(input);
  const db = getDb();
  db.transaction(() => {
    const a = db.prepare(`SELECT a.*, r.status review_status FROM authorization a JOIN payment_review r ON r.authorization_id=a.id WHERE a.id=?`).get(authId) as (ReviewRow & { decision: string; review_status: string }) | undefined;
    if (!a) throw new UserError("not_found", "Payment review not found.", 404);
    assertTreasurer(actor, a.society_id);
    if (a.decision !== "approved") throw new UserError("validation", "Declined payments cannot receive recurring approval.");
    if (!["pending","receipt_requested"].includes(a.review_status)) throw new UserError("conflict", "This payment has already been reviewed.", 409);
    if (b.status === "misuse" && !b.note) throw new UserError("validation", "Record the issue and recovery follow-up. This does not refund the payment.");
    if (b.mandate) {
      const m = b.mandate;
      if (b.status !== "approved" || m.minCents > a.amount_cents || m.maxCents < a.amount_cents || m.maxCents < m.minCents || m.endsAt <= nowIso() || m.endsAt > new Date(Date.now()+366*86400000).toISOString()) throw new UserError("validation", "The approved amount must be in range and the mandate must end within one year.");
      db.prepare(`UPDATE recurring_mandate SET status='revoked' WHERE society_id=? AND member_id=? AND merchant_key=? AND status='active'`).run(a.society_id,a.member_id,a.merchant_key);
      db.prepare(`INSERT INTO recurring_mandate(id,society_id,member_id,merchant_key,merchant_name,currency,min_cents,max_cents,cadence,starts_at,ends_at,last_used_at,approved_from,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newId("mandate"),a.society_id,a.member_id,a.merchant_key,a.merchant_name,a.currency,m.minCents,m.maxCents,m.cadence,a.created_at,m.endsAt,a.created_at,authId,actor.id,nowIso());
    }
    db.prepare(`UPDATE payment_review SET status=?,note=?,reviewed_by=?,reviewed_at=? WHERE authorization_id=?`).run(b.status,b.note,actor.id,nowIso(),authId);
    audit(actor.id, `payment_review.${b.status}`, authId, { note: b.note, recurring: Boolean(b.mandate) });
  }).immediate();
}
export interface Mandate { id: string; merchant_name: string; min_cents: number; max_cents: number; cadence: string; ends_at: string; status: string }
export function listMandates(societyId: string) {
  return getDb().prepare(`SELECT * FROM recurring_mandate WHERE society_id=? ORDER BY created_at DESC`).all(societyId) as Mandate[];
}
export function revokeMandate(actor: Actor, id: string) {
  const m = getDb().prepare(`SELECT society_id FROM recurring_mandate WHERE id=?`).get(id) as { society_id: string } | undefined;
  if (!m) throw new UserError("not_found", "Mandate not found",404);
  assertTreasurer(actor,m.society_id);
  getDb().prepare(`UPDATE recurring_mandate SET status='revoked' WHERE id=?`).run(id);
  audit(actor.id,"mandate.revoked",id);
}

export interface Expense { id: string; society_id: string; member_id: string; member_name: string; event_id: string | null; merchant: string; category: string; purpose: string; amount_cents: number; incurred_on: string; receipt_name: string; status: string; note: string; payment_reference: string | null; paid_at: string | null; created_at: string }
export function listExpenses(actor: Actor) {
  return getDb().prepare(`SELECT e.id,e.society_id,e.member_id,m.name member_name,e.event_id,e.merchant,e.category,e.purpose,e.amount_cents,e.incurred_on,e.receipt_name,e.status,e.note,e.payment_reference,e.paid_at,e.created_at FROM expense e JOIN member m ON m.id=e.member_id
    ${actor.kind === "member" ? "WHERE e.society_id=?" + (["treasurer","senior_treasurer"].includes(actor.role) ? "" : " AND e.member_id=?") : ""} ORDER BY e.created_at DESC`)
    .all(...(actor.kind === "member" ? [actor.societyId, ...(["treasurer","senior_treasurer"].includes(actor.role) ? [] : [actor.id])] : [])) as Expense[];
}
export function submitExpense(actor: Actor, input: unknown, receipt: { name: string; type: string; bytes: Buffer }) {
  if (actor.kind !== "member") throw new UserError("forbidden","Only a society member can claim expenses.",403);
  const b = z.object({ merchant: z.string().trim().min(1).max(100), purpose: z.string().trim().min(3).max(1000), category: z.enum(["food","travel","equipment","venue","other"]), amountCents: cents, incurredOn: z.iso.date(), eventId: z.string().nullable() }).parse(input);
  if (b.incurredOn > nowIso().slice(0,10)) throw new UserError("validation","Expense date cannot be in the future.");
  if (!receipt.bytes.length || receipt.bytes.length > 5*1024*1024) throw new UserError("validation","Attach a receipt up to 5 MB.");
  const magic = receipt.bytes;
  const valid = (receipt.type === "application/pdf" && magic.subarray(0,5).toString() === "%PDF-") || (receipt.type === "image/png" && magic.subarray(0,8).toString("hex") === "89504e470d0a1a0a") || (receipt.type === "image/jpeg" && magic[0] === 255 && magic[1] === 216 && magic[2] === 255);
  if (!valid) throw new UserError("validation","Receipt must be a PDF, PNG or JPEG file.");
  const db = getDb();
  if (b.eventId && !db.prepare(`SELECT id FROM event WHERE id=? AND society_id=?`).get(b.eventId,actor.societyId)) throw new UserError("validation","Choose an event from your society.");
  const id = newId("expense");
  db.prepare(`INSERT INTO expense(id,society_id,member_id,event_id,merchant,category,purpose,amount_cents,incurred_on,receipt_name,receipt_type,receipt,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,actor.societyId,actor.id,b.eventId,b.merchant,b.category,b.purpose,b.amountCents,b.incurredOn,receipt.name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,100),receipt.type,receipt.bytes,nowIso());
  audit(actor.id,"expense.submitted",id);
  return id;
}
export function reviewExpense(actor: Actor, id: string, input: unknown) {
  const b = z.object({ action: z.enum(["approve","decline","paid"]), note: z.string().trim().max(1000), paymentReference: z.string().trim().max(160).optional() }).parse(input);
  const db = getDb();
  return db.transaction(() => {
    const e = db.prepare(`SELECT * FROM expense WHERE id=?`).get(id) as Expense | undefined;
    if (!e) throw new UserError("not_found","Expense not found",404);
    assertTreasurer(actor,e.society_id);
    if (b.action === "paid" && e.status === "paid") return false;
    if (b.action === "paid") {
      if (e.status !== "approved" || !b.paymentReference) throw new UserError("validation","Approve first and enter the reference for the external repayment.");
      if (societyBalances(e.society_id).available < e.amount_cents) throw new UserError("insufficient_budget","Insufficient society balance to record this repayment.");
      postEntry({ societyId:e.society_id,eventId:e.event_id,type:"spend",amountCents:e.amount_cents,refType:"expense",refId:id,memo:`Reimbursement: ${e.merchant}`,at:nowIso() });
      db.prepare(`UPDATE expense SET status='paid',paid_at=?,payment_reference=?,note=? WHERE id=?`).run(nowIso(),b.paymentReference,b.note,id);
    } else {
      if (e.status !== "submitted") throw new UserError("conflict","This expense has already been reviewed.",409);
      if (b.action === "decline" && !b.note) throw new UserError("validation","Explain why this expense was declined.");
      db.prepare(`UPDATE expense SET status=?,note=?,reviewed_by=? WHERE id=?`).run(b.action === "approve" ? "approved" : "declined",b.note,actor.id,id);
    }
    audit(actor.id,`expense.${b.action}`,id,{ note:b.note, paymentReference:b.paymentReference });
    return true;
  }).immediate();
}
export function getReceipt(actor: Actor, id: string) {
  const e = getDb().prepare(`SELECT * FROM expense WHERE id=?`).get(id) as (Expense & { receipt: Buffer; receipt_type: string }) | undefined;
  if (!e) throw new UserError("not_found","Receipt not found",404);
  assertSociety(actor,e.society_id);
  if (actor.kind === "member" && !["treasurer","senior_treasurer"].includes(actor.role) && actor.id !== e.member_id) throw new UserError("forbidden","This receipt belongs to another member.",403);
  return e;
}

export interface Evidence { start: string; end: string; spent: number; previousSpent: number; previousCount: number; reimbursements: number; outstanding: number; held: number; categories: { name: string; cents: number }[]; events: { name: string; cents: number }[]; entries: { id: number; ref_type: string; ref_id: string; amount_cents: number; type: string; created_at: string; memo: string }[] }
export function reportEvidence(societyId: string, year: number): Evidence {
  z.number().int().min(2020).max(2100).parse(year);
  const db = getDb();
  const start = `${year}-09-01T00:00:00.000Z`, end = `${year+1}-09-01T00:00:00.000Z`;
  const entries = db.prepare(`SELECT id,ref_type,ref_id,amount_cents,type,created_at,memo FROM ledger_entry WHERE society_id=? AND created_at>=? AND created_at<? AND type IN ('spend','refund') ORDER BY created_at`).all(societyId,start,end) as Evidence["entries"];
  const previous = db.prepare(`SELECT COUNT(*) n,COALESCE(SUM(CASE type WHEN 'spend' THEN amount_cents ELSE -amount_cents END),0) cents FROM ledger_entry WHERE society_id=? AND created_at>=? AND created_at<? AND type IN ('spend','refund')`).get(societyId,`${year-1}-09-01T00:00:00.000Z`,start) as { n: number; cents: number };
  const group = (expr: string, join: string) => db.prepare(`SELECT ${expr} name, SUM(CASE l.type WHEN 'spend' THEN l.amount_cents ELSE -l.amount_cents END) cents FROM ledger_entry l ${join} WHERE l.society_id=? AND l.created_at>=? AND l.created_at<? AND l.type IN ('spend','refund') GROUP BY 1 ORDER BY cents DESC`).all(societyId,start,end) as { name: string; cents: number }[];
  const outstanding = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) n FROM expense WHERE society_id=? AND status IN ('submitted','approved') AND incurred_on>=? AND incurred_on<?`).get(societyId,start.slice(0,10),end.slice(0,10)) as { n: number };
  return { start,end,spent:entries.reduce((s,e)=>s+(e.type === "spend" ? e.amount_cents : -e.amount_cents),0),previousSpent:previous.cents,previousCount:previous.n,reimbursements:entries.filter(e=>e.ref_type === "expense").reduce((s,e)=>s+e.amount_cents,0),outstanding:outstanding.n,held:societyBalances(societyId).held,
    categories:group("COALESCE(a.mcc_group,x.category,'other')","LEFT JOIN authorization a ON l.ref_type='authorization' AND a.id=l.ref_id LEFT JOIN expense x ON l.ref_type='expense' AND x.id=l.ref_id"),
    events:group("COALESCE(e.name,'General spending')","LEFT JOIN event e ON e.id=l.event_id"),entries };
}
export interface GrantReport { id: string; society_id: string; society_name: string; year: number; status: string; evidence: string; narrative: string; estimate_cents: number; draft_source: string; council_notes: string; approved_cents: number | null; updated_at: string; submitted_at: string | null }
export function listReports(actor: Actor) {
  return getDb().prepare(`SELECT r.*,s.name society_name FROM grant_report r JOIN society s ON s.id=r.society_id ${actor.kind === "member" ? "WHERE r.society_id=?" : "WHERE r.status != 'draft'"} ORDER BY r.year DESC,r.updated_at DESC`).all(...(actor.kind === "member" ? [actor.societyId] : [])) as GrantReport[];
}
export async function draftReport(actor: Actor, societyId: string, year: number) {
  assertReportOwner(actor,societyId);
  const db = getDb();
  if (db.prepare(`SELECT id FROM grant_report WHERE society_id=? AND year=?`).get(societyId,year)) throw new UserError("conflict","A report for this year already exists. Edit the existing draft.",409);
  const evidence = reportEvidence(societyId,year);
  const draft = await draftGrantNarrative({ year,spent:evidence.spent,previousSpent:evidence.previousSpent,previousCount:evidence.previousCount,reimbursements:evidence.reimbursements,outstanding:evidence.outstanding,categories:evidence.categories });
  // Recheck after the asynchronous model call: ownership or another draft may have changed.
  assertReportOwner(actor,societyId);
  const id = newId("report");
  db.prepare(`INSERT INTO grant_report(id,society_id,year,evidence,narrative,estimate_cents,draft_source,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id,societyId,year,JSON.stringify(evidence),draft.text,Math.max(0,evidence.spent+evidence.outstanding),draft.source,actor.id,nowIso());
  audit(actor.id,"report.drafted",id,{ source:draft.source });
  return id;
}
export function updateReport(actor: Actor, id: string, input: unknown) {
  const b = z.object({ action:z.enum(["save","submit","return","approve","comment"]),narrative:z.string().trim().min(1).max(10000).optional(),estimateCents:z.number().int().min(0).max(100_000_000).optional(),notes:z.string().trim().max(5000).optional(),approvedCents:z.number().int().min(0).max(100_000_000).optional() }).parse(input);
  const db=getDb();
  db.transaction(()=>{
    const r=db.prepare(`SELECT * FROM grant_report WHERE id=?`).get(id) as GrantReport | undefined;
    if (!r) throw new UserError("not_found","Report not found",404);
    if (["save","submit"].includes(b.action)) {
      assertReportOwner(actor,r.society_id);
      if (!["draft","returned"].includes(r.status)) throw new UserError("conflict","Council has this report. Ask for it to be returned before editing.",409);
      if (!b.narrative || b.estimateCents === undefined) throw new UserError("validation","Provide a narrative and next-year estimate.");
      db.prepare(`UPDATE grant_report SET narrative=?,estimate_cents=?,status=?,evidence=?,submitted_at=?,updated_at=? WHERE id=?`).run(b.narrative,b.estimateCents,b.action === "submit" ? "submitted" : r.status,JSON.stringify(reportEvidence(r.society_id,r.year)),b.action === "submit" ? nowIso() : null,nowIso(),id);
    } else {
      assertCouncil(actor);
      if (r.status !== "submitted") throw new UserError("conflict","Only submitted reports can be reviewed.",409);
      if (!b.notes || (b.action === "approve" && b.approvedCents === undefined)) throw new UserError("validation","Record Council feedback and, for approval, the grant amount.");
      db.prepare(`UPDATE grant_report SET council_notes=?,approved_cents=?,status=?,updated_at=? WHERE id=?`).run(`${r.council_notes}${r.council_notes ? "\n\n" : ""}${nowIso()}: ${b.notes}`,b.action === "approve" ? b.approvedCents : null,b.action === "approve" ? "approved" : b.action === "return" ? "returned" : "submitted",nowIso(),id);
    }
    audit(actor.id,`report.${b.action}`,id,{ notes:b.notes,approvedCents:b.approvedCents });
  }).immediate();
}

export const memberRoleOptions = Object.entries(ROLE_LABEL).filter(([role])=>!["treasurer","senior_treasurer"].includes(role));
