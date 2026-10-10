import { NextResponse } from "next/server";
import { createTopUpCheckout } from "@/lib/payments";
import { handleError, readJson } from "@/lib/api";

/** POST /api/topups/checkout — public; creates a Stripe Checkout Session (mode=payment, EUR). */
export async function POST(req: Request) {
  try {
    const b = await readJson<{ society_slug: string; amount_cents: number; payer_name: string; message?: string; show_publicly?: boolean }>(req);
    const r = await createTopUpCheckout({
      societySlug: String(b.society_slug ?? ""),
      amountCents: Number(b.amount_cents),
      payerName: String(b.payer_name ?? ""),
      message: b.message,
      showPublicly: Boolean(b.show_publicly),
    });
    return NextResponse.json({ url: r.url, topup_id: r.topupId });
  } catch (e) {
    return handleError(e);
  }
}
