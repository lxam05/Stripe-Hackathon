import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { GamesFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { SHOPS } from "@/lib/shops";

export const metadata = { title: { absolute: "Pixel Vault · Consoles & games" } };

export default function GamesShop() {
  return (
    <GamesFrame>
      <h1 className="font-mono text-sm uppercase tracking-[0.3em] text-[#f0abfc]">{"// Sony PlayStation"}</h1>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2">
        {SHOPS.games.items.map((item) => (
          <li key={item.id} className="border border-[#2a2a3a] bg-[#0e0e17]">
            <div className="flex h-40 items-center justify-center bg-gradient-to-br from-[#1e3a8a] via-[#0e0e17] to-[#701a75]">
              <Gamepad2 className="h-16 w-16 text-white/80" strokeWidth={1.25} />
            </div>
            <div className="p-5">
              <div className="text-lg font-semibold">{item.name}</div>
              <div className="text-sm text-[#9a9ab0]">{item.blurb}</div>
              <div className="mt-3 font-mono text-2xl text-[#22d3ee]">{fmtEur(item.cents)}</div>
              <Link
                href={`/shops/games/pay?item=${item.id}`}
                className="mt-4 block bg-[#22d3ee] py-3 text-center font-mono text-sm font-bold uppercase tracking-widest text-[#07070c] hover:bg-[#67e8f9]"
              >
                Buy now
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </GamesFrame>
  );
}
