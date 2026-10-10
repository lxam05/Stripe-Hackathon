"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, LoaderCircle, ShoppingBag } from "lucide-react";
import { button } from "./ui";

type Details = { number: string; cvc: string; expMonth: number; expYear: number };

/** Key the demo shops read to autofill their card form (session storage only, never a URL). */
export const DEMO_WALLET_KEY = "balance-demo-wallet";

/** The cardholder's own card number, expiry and CVC, for paying online (sandbox cards only). */
export function CardDetails({ cardId, holder }: { cardId: string; holder: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<Details | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (details) return details;
    const res = await fetch(`/api/cards/${cardId}/details`, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error?.message ?? "Couldn't load your card details.");
    setDetails(j);
    return j as Details;
  };

  const run = async (key: string, then?: (d: Details) => void) => {
    setBusy(key);
    setError(null);
    try {
      const d = await load();
      then?.(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Demo speed-up: hand this card to the shop's form, like a browser's saved-card autofill.
  const shop = (href: string) =>
    run(href, (d) => {
      try {
        sessionStorage.setItem(
          DEMO_WALLET_KEY,
          JSON.stringify({ number: d.number, exp: `${String(d.expMonth).padStart(2, "0")}/${String(d.expYear).slice(-2)}`, cvc: d.cvc, name: holder }),
        );
      } catch {}
      router.push(href);
    });

  return (
    <div className="space-y-2.5">
      {details ? (
        <dl className="space-y-2 rounded-xl bg-stone p-4 text-white">
          <Field label="Card number" value={details.number.replace(/(\d{4})(?=\d)/g, "$1 ")} copy={details.number} />
          <div className="flex gap-8">
            <Field label="Expiry" value={`${String(details.expMonth).padStart(2, "0")}/${String(details.expYear).slice(-2)}`} />
            <Field label="CVC" value={details.cvc} />
          </div>
        </dl>
      ) : (
        <button className={button("secondary", "w-full")} onClick={() => run("reveal")} disabled={!!busy}>
          {busy === "reveal" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Show card details
        </button>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className={button("primary")} onClick={() => shop("/shops/pizza")} disabled={!!busy}>
          {busy === "/shops/pizza" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} Slice Republic
        </button>
        <button className={button("secondary")} onClick={() => shop("/shops/games")} disabled={!!busy}>
          {busy === "/shops/games" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} Pixel Vault
        </button>
      </div>
      <p className="text-xs text-ink-3">Fictional outside shops (Stripe sandbox). Their card form is filled in with this card.</p>
    </div>
  );
}

function Field({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div>
      <dt className="text-xs text-white/60">{label}</dt>
      <dd className="flex items-center gap-2 font-mono text-[15px] tabular">
        {value}
        {copy && (
          <button type="button" aria-label={`Copy ${label.toLowerCase()}`} className="text-white/60 hover:text-white" onClick={() => navigator.clipboard?.writeText(copy)}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}
