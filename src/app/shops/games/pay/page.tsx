import { notFound } from "next/navigation";
import { ShopCardForm } from "@/components/shop-card-form";
import { GAMES_FORM, GamesFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { shopItem } from "@/lib/shops";

export const metadata = { title: { absolute: "Checkout · Pixel Vault" } };

export default async function GamesPay({ searchParams }: PageProps<"/shops/games/pay">) {
  const { item: itemId, error } = await searchParams;
  const found = shopItem("games", typeof itemId === "string" ? itemId : "");
  if (!found) notFound();
  return (
    <GamesFrame>
      <div className="mx-auto max-w-md">
        <h1 className="font-mono text-sm uppercase tracking-[0.3em] text-[#f0abfc]">{"// Secure checkout"}</h1>
        <div className="mt-4 flex justify-between border border-[#2a2a3a] bg-[#0e0e17] p-4">
          <span>{found.item.name}</span>
          <span className="font-mono text-[#22d3ee]">{fmtEur(found.item.cents)}</span>
        </div>
        <div className="mt-8">
          <ShopCardForm shop="games" item={found.item.id} total={fmtEur(found.item.cents)} error={typeof error === "string" ? error : null} theme={GAMES_FORM} />
        </div>
      </div>
    </GamesFrame>
  );
}
