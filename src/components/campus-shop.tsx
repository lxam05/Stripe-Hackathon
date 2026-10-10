"use client";

import { useState } from "react";
import { Check, Gamepad2, LoaderCircle, Pizza, ShieldAlert, WalletCards } from "lucide-react";
import { DEMO_PRODUCTS, type DemoProductId } from "@/lib/demo-shop";
import { fmtEur } from "@/lib/money";
import { button, cx, Notice } from "./ui";

type PurchaseResult = {
  authorization_id: string | null;
  approved: boolean;
  captured: boolean;
  cardholder: string;
  card_last4: string;
  balance_before: number;
  balance_after: number;
  decline_reason?: string | null;
};

type Assessment = {
  status: string;
  source?: string;
  risk_level?: string;
  summary?: string;
  review_status?: string | null;
  flag_status?: string | null;
};

export function CampusShop({ card }: { card: { id: string; last4: string; cardholder: string; societyName: string; status: string } }) {
  const [busy, setBusy] = useState<DemoProductId | null>(null);
  const [result, setResult] = useState<{ product: DemoProductId; purchase: PurchaseResult; assessment?: Assessment } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(productId: DemoProductId) {
    setBusy(productId);
    setError(null);
    setResult(null);
    const key = crypto.randomUUID();
    try {
      const response = await fetch("/api/demo-purchases", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ card_id: card.id, product_id: productId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "The payment could not be completed.");
      const purchase = payload as PurchaseResult;
      setResult({ product: productId, purchase });
      if (purchase.authorization_id) {
        for (let attempt = 0; attempt < 24; attempt++) {
          const assessmentResponse = await fetch(`/api/assessments/${purchase.authorization_id}`, { cache: "no-store" });
          if (assessmentResponse.ok) {
            const assessment = (await assessmentResponse.json()) as Assessment;
            setResult({ product: productId, purchase, assessment });
            if (assessment.status === "done") break;
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The payment could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-9 max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-coral">Campus marketplace</p>
        <h1 className="display text-5xl leading-none text-stone sm:text-6xl">A tiny shop for a big demo.</h1>
        <p className="mt-4 text-base leading-7 text-ink-2">Choose a purchase for {card.societyName}. Balance will apply the card controls, pay it, then ask JEV to check the context.</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#dfcdb7] bg-[#fffaf2] px-4 py-3 text-sm shadow-[var(--shadow-card)]">
        <WalletCards className="h-5 w-5 text-stone" />
        <span className="font-medium text-ink">Paying with {card.cardholder}</span>
        <span className="text-ink-3">Card ••{card.last4}</span>
        {card.status !== "active" && <span className="rounded-full bg-bad-bg px-2 py-1 text-xs font-medium text-bad">Card is not active</span>}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {(Object.keys(DEMO_PRODUCTS) as DemoProductId[]).map((id) => {
          const product = DEMO_PRODUCTS[id];
          const Icon = id === "pizza" ? Pizza : Gamepad2;
          return (
            <article key={id} className="overflow-hidden rounded-[28px] border border-[#dfcdb7] bg-[#fffaf2] shadow-[var(--shadow-lift)]">
              <div className={cx("flex h-48 items-center justify-center", id === "pizza" ? "bg-coral/15" : "bg-stone/10")}>
                <div className={cx("flex h-28 w-28 items-center justify-center rounded-full", id === "pizza" ? "bg-coral text-white" : "bg-stone text-butter")}>
                  <Icon className="h-14 w-14" strokeWidth={1.5} />
                </div>
              </div>
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{product.eyebrow}</p>
                <div className="mt-2 flex items-start justify-between gap-4">
                  <h2 className="display text-3xl leading-tight text-ink">{product.name}</h2>
                  <span className="text-xl font-semibold tabular text-stone">{fmtEur(product.amountCents)}</span>
                </div>
                <p className="mt-2 min-h-12 text-sm leading-6 text-ink-2">{product.description}</p>
                <button className={button(id === "pizza" ? "coral" : "primary", "mt-5 w-full py-3")} disabled={Boolean(busy) || card.status !== "active"} onClick={() => buy(id)}>
                  {busy === id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                  {busy === id ? "Paying…" : `Pay ${fmtEur(product.amountCents)}`}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {error && <div className="mt-6"><Notice tone="bad" title="Payment failed">{error}</Notice></div>}
      {result && <PurchaseReceipt result={result} />}
    </div>
  );
}

function PurchaseReceipt({ result }: { result: { product: DemoProductId; purchase: PurchaseResult; assessment?: Assessment } }) {
  const { purchase, assessment } = result;
  const underReview = assessment?.review_status === "pending" || assessment?.flag_status === "open";
  const assessing = purchase.approved && assessment?.status !== "done";
  return (
    <section className="rise mt-7 rounded-[28px] border border-[#dfcdb7] bg-surface p-6 shadow-[var(--shadow-lift)]" aria-live="polite">
      <div className="flex gap-3">
        <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", purchase.approved ? underReview ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok" : "bg-bad-bg text-bad")}>
          {assessing ? <LoaderCircle className="h-5 w-5 animate-spin" /> : underReview ? <ShieldAlert className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="display text-3xl text-ink">{purchase.approved ? purchase.captured ? "Paid" : "Approved" : "Declined"}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {!purchase.approved
              ? purchase.decline_reason
              : assessing
                ? "Payment complete. JEV is checking the context…"
                : underReview
                  ? "Sent to treasurer for review."
                  : "Nothing unusual."}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <ReceiptItem label="Cardholder" value={purchase.cardholder} />
        <ReceiptItem label="Card" value={`••${purchase.card_last4}`} />
        <ReceiptItem label="Balance before" value={fmtEur(purchase.balance_before)} />
        <ReceiptItem label="Balance after" value={fmtEur(purchase.balance_after)} />
      </dl>
      {underReview && assessment?.summary && <p className="mt-4 rounded-xl bg-warn-bg px-4 py-3 text-sm leading-6 text-warn"><strong>JEV:</strong> {assessment.summary}</p>}
    </section>
  );
}

function ReceiptItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-ink-3">{label}</dt><dd className="mt-1 font-medium tabular text-ink">{value}</dd></div>;
}
