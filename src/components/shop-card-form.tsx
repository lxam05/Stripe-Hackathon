"use client";

import { useState, useSyncExternalStore } from "react";

export interface ShopFormTheme {
  label: string;
  field: string;
  button: string;
  error: string;
}

// Same key as card-details.tsx; not imported so the shop stays independent of Balance's UI.
const DEMO_WALLET_KEY = "balance-demo-wallet";
type Saved = { number: string; exp: string; cvc: string; name: string };

/** A demo shop's own card form (the shop, not Balance). Posts to /api/shops/pay once. */
export function ShopCardForm(props: { shop: string; item: string; total: string; error: string | null; theme: ShopFormTheme }) {
  // Session storage only exists in the browser, so the form renders after hydration.
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? <CardForm {...props} /> : null;
}

const noop = () => () => {};

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DEMO_WALLET_KEY) ?? "null") as Saved | null;
    return saved?.number ? { ...saved, number: saved.number.replace(/(\d{4})(?=\d)/g, "$1 ") } : null;
  } catch {
    return null;
  }
}

function CardForm({ shop, item, total, error, theme }: { shop: string; item: string; total: string; error: string | null; theme: ShopFormTheme }) {
  const [order] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  // Demo speed-up: fill in the card the officer came from in Balance, like a saved-card autofill.
  const [saved] = useState(readSaved);
  const [card, setCard] = useState<Saved>(saved ?? { number: "", exp: "", cvc: "", name: "" });
  const autofilled = Boolean(saved);

  const set = (k: keyof Saved) => (e: React.ChangeEvent<HTMLInputElement>) => setCard((c) => ({ ...c, [k]: e.target.value }));

  return (
    <form action="/api/shops/pay" method="post" onSubmit={() => setSending(true)} className="space-y-4" autoComplete="off">
      <input type="hidden" name="shop" value={shop} />
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="order" value={order} />
      {error && <p className={theme.error}>{error}</p>}
      {autofilled && <p className="text-xs opacity-70">Card details filled in from your saved card.</p>}
      <label className="block">
        <span className={theme.label}>Card number</span>
        <input name="number" inputMode="numeric" placeholder="1234 5678 9012 3456" required className={theme.field} value={card.number} onChange={set("number")} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={theme.label}>Expiry (MM/YY)</span>
          <input name="exp" placeholder="MM/YY" required pattern="\d{1,2}\s*/\s*\d{2,4}" className={theme.field} value={card.exp} onChange={set("exp")} />
        </label>
        <label className="block">
          <span className={theme.label}>CVC</span>
          <input name="cvc" inputMode="numeric" placeholder="123" required pattern="\d{3,4}" className={theme.field} value={card.cvc} onChange={set("cvc")} />
        </label>
      </div>
      <label className="block">
        <span className={theme.label}>Name on card</span>
        <input name="name" required className={theme.field} value={card.name} onChange={set("name")} />
      </label>
      <button disabled={sending} className={theme.button}>
        {sending ? "Processing…" : `Pay ${total}`}
      </button>
    </form>
  );
}
