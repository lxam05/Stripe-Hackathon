import type { ReactNode } from "react";
import Link from "next/link";
import { Gamepad2, Pizza } from "lucide-react";
import type { ShopFormTheme } from "./shop-card-form";

// Chrome for the two fictional outside shops. Deliberately nothing like Balance (no serif, no
// Balance palette or logo) so it's obvious on screen that the officer has left Balance.

export function PizzaFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fff4d6] text-[#2b1a0e]" style={{ fontFamily: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif" }}>
      <header className="bg-[#e63312] text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <Pizza className="h-8 w-8" strokeWidth={2.5} />
          <Link href="/shops/pizza" className="text-2xl font-black uppercase tracking-tight">
            Slice Republic
          </Link>
          <span className="ml-auto rounded-full bg-[#ffcc00] px-3 py-1 text-xs font-bold text-[#2b1a0e]">Open till 11pm</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">
        {children}
        <p className="mt-10 text-xs opacity-70">Fictional shop for the Balance demo (Stripe sandbox, test payments only).</p>
      </main>
    </div>
  );
}

export const PIZZA_FORM: ShopFormTheme = {
  label: "mb-1 block text-sm font-bold",
  field: "w-full rounded-xl border-4 border-[#2b1a0e] bg-white px-3 py-2.5 font-mono text-lg outline-none focus:border-[#e63312]",
  button: "w-full rounded-full bg-[#e63312] py-4 text-lg font-black text-white shadow-[0_4px_0_#2b1a0e] active:translate-y-1 active:shadow-none disabled:opacity-60",
  error: "rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#e63312] border-4 border-[#e63312]",
};

export function GamesFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#07070c] text-[#e6e6f0]" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <header className="border-b border-[#22d3ee]/30">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4">
          <Gamepad2 className="h-7 w-7 text-[#22d3ee]" />
          <Link href="/shops/games" className="font-mono text-xl font-bold uppercase tracking-[0.25em]">
            Pixel<span className="text-[#f0abfc]">Vault</span>
          </Link>
          <span className="ml-auto font-mono text-xs uppercase text-[#22d3ee]">Free next-day shipping</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-10">
        {children}
        <p className="mt-10 font-mono text-xs text-[#5c5c70]">Fictional shop for the Balance demo (Stripe sandbox, test payments only).</p>
      </main>
    </div>
  );
}

export const GAMES_FORM: ShopFormTheme = {
  label: "mb-1 block font-mono text-xs uppercase tracking-widest text-[#9a9ab0]",
  field: "w-full border border-[#2a2a3a] bg-[#0e0e17] px-3 py-2.5 font-mono text-lg text-white outline-none focus:border-[#22d3ee]",
  button: "w-full bg-[#22d3ee] py-4 font-mono text-sm font-bold uppercase tracking-widest text-[#07070c] hover:bg-[#67e8f9] disabled:opacity-60",
  error: "border border-[#f0abfc] px-4 py-3 font-mono text-sm text-[#f0abfc]",
};

/** Demo-only link back to Balance after paying (not something a real shop would show). */
export function BackToBalance({ className }: { className: string }) {
  return (
    <p className={className}>
      Demo: now check the payment in Balance.{" "}
      <Link href="/dashboard" className="font-bold underline">
        Back to the Balance dashboard →
      </Link>
    </p>
  );
}
