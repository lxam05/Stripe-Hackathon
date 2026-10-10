import { getDb,nowIso } from "./db";
import { reportEvidence } from "./workflows";

/** Additive demo upgrade. Does not reset a ledger, change cards, or contact Stripe/AI. */
export function seedWorkflowExamples() {
  const db=getDb();
  if(!db.prepare(`SELECT id FROM society WHERE id='soc_drama'`).get() || db.prepare(`SELECT id FROM audit_log WHERE action='demo.workflows_v2'`).get())return;
  db.transaction(()=>{
    for(const [id,name,role] of [["mem_drama_senior","Evelyn Byrne (demo)","senior_treasurer"],["mem_drama_member","Jamie Kelly (demo)","member"],["mem_drama_auditor","Alex Ryan (demo)","auditor"]]) db.prepare(`INSERT OR IGNORE INTO member(id,society_id,name,email,role,member_ref,created_at) VALUES(?,'soc_drama',?,?,?,?,?)`).run(id,name,`${id}@ucdconnect.example`,role,id,nowIso());
    // Historic reviews are labelled as imported, not fabricated treasurer approvals.
    db.prepare(`UPDATE payment_review SET status='imported_history',note='Synthetic history imported; no individual treasurer decision was recorded.' WHERE authorization_id IN (SELECT id FROM authorization WHERE source='seed' AND created_at<'2026-09-01') AND status='pending'`).run();
    const evidence=reportEvidence("soc_drama",2025);
    db.prepare(`INSERT OR IGNORE INTO grant_report(id,society_id,year,evidence,narrative,estimate_cents,draft_source,created_by,updated_at) VALUES('report_demo_drama','soc_drama',2025,?,?,?,?,?,?)`).run(JSON.stringify(evidence),`Draft for Council: recorded net spending was €${(evidence.spent/100).toFixed(2)} in 2025/26. Review the evidence by category and event, explain unusual purchases, and adjust the next-year estimate for planned activities and other funding. This synthetic example is editable and has not been submitted.`,Math.max(0,evidence.spent),"Synthetic template example · not AI-generated","mem_drama_senior",nowIso());
    db.prepare(`INSERT INTO audit_log(actor,action,target,at) VALUES('seed','demo.workflows_v2','demo',?)`).run(nowIso());
  }).immediate();
}

