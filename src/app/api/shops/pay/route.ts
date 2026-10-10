import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isShopId, payAtShop } from "@/lib/shops";

/**
 * POST /api/shops/pay — a demo shop's card form (card details travel only in this POST body).
 * Approved → the shop's confirmation page; declined → back to the form with the merchant's message.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const shop = String(f.get("shop") ?? "");
  const item = String(f.get("item") ?? "");
  const base = `${env.appUrl}/shops/${isShopId(shop) ? shop : "pizza"}`;
  try {
    const r = await payAtShop(
      shop,
      item,
      { number: String(f.get("number") ?? ""), exp: String(f.get("exp") ?? ""), cvc: String(f.get("cvc") ?? "") },
      String(f.get("order") ?? crypto.randomUUID()).slice(0, 64),
    );
    if (r.approved) return NextResponse.redirect(`${base}/success?item=${encodeURIComponent(item)}&card=${r.last4}`, 303);
    return NextResponse.redirect(`${base}/pay?item=${encodeURIComponent(item)}&error=${encodeURIComponent(r.reason)}`, 303);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment failed.";
    return NextResponse.redirect(`${base}/pay?item=${encodeURIComponent(item)}&error=${encodeURIComponent(msg)}`, 303);
  }
}
