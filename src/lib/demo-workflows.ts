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
    const receipt=demoReceipt();
    for(const [id,member,merchant,amount,status,purpose] of [
      ["expense_demo_donuts","mem_drama_member","Centra (fictional)",8500,"submitted","Emergency replacement refreshments after the delivery failed. Used discretion to keep the event running."],
      ["expense_demo_auditor","mem_drama_auditor","Event supplies (fictional)",100000,"approved","Auditor covered event supplies personally. Approved claim awaiting external repayment; illustrates the interview-reported liquidity problem."]
    ] as const) db.prepare(`INSERT OR IGNORE INTO expense(id,society_id,member_id,merchant,category,purpose,amount_cents,incurred_on,receipt_name,receipt_type,receipt,status,created_at) VALUES(?,'soc_drama',?,?,'food',?,?,?,'synthetic-receipt.pdf','application/pdf',?,?,?)`).run(id,member,merchant,purpose,amount,nowIso().slice(0,10),receipt,status,nowIso());
    const evidence=reportEvidence("soc_drama",2025);
    db.prepare(`INSERT OR IGNORE INTO grant_report(id,society_id,year,evidence,narrative,estimate_cents,draft_source,created_by,updated_at) VALUES('report_demo_drama','soc_drama',2025,?,?,?,?,?,?)`).run(JSON.stringify(evidence),`Draft for Council: recorded net spending was €${(evidence.spent/100).toFixed(2)} in 2025/26. Review the evidence by category and event, explain unusual purchases, and adjust the next-year estimate for planned activities and other funding. This synthetic example is editable and has not been submitted.`,Math.max(0,evidence.spent),"Synthetic template example · not AI-generated","mem_drama_senior",nowIso());
    db.prepare(`INSERT INTO audit_log(actor,action,target,at) VALUES('seed','demo.workflows_v2','demo',?)`).run(nowIso());
  }).immediate();
}

/** Small valid PDF fixture with conspicuous fictional receipt text. No real personal data. */
function demoReceipt() {
  const content="BT /F1 16 Tf 50 760 Td (SYNTHETIC RECEIPT - DEMO ONLY) Tj 0 -30 Td /F1 11 Tf (Fictional society expense. No real purchase or tax invoice.) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf="%PDF-1.4\n";const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
