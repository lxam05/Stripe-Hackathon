import { getActor } from "@/lib/session";
import { apiError, handleError } from "@/lib/api";
import { getReceipt } from "@/lib/workflows";
export async function GET(_req:Request,{ params }:{ params:Promise<{ id:string }> }) {
  const actor=await getActor();
  if (!actor) return apiError(401,"unauthenticated","Sign in first.");
  try {
    const e=getReceipt(actor,(await params).id);
    return new Response(new Uint8Array(e.receipt),{ headers:{ "Content-Type":e.receipt_type,"Content-Disposition":`attachment; filename="${e.receipt_name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'" } });
  } catch(e) { return handleError(e); }
}
