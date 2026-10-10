import Link from "next/link";
import { notFound } from "next/navigation";
import { BackToBalance, GamesFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { shopItem } from "@/lib/shops";

export const metadata = { title: { absolute: "Order confirmed · Pixel Vault" } };

/** Reached only after the card was approved; declines go back to the payment form. */
export default async function GamesSuccess({ searchParams }: PageProps<"/shops/games/success">) {
  const { item: itemId, card } = await searchParams;
  const found = shopItem("games", typeof itemId === "string" ? itemId : "");
  if (!found) notFound();
  return (
    <GamesFrame>
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-mono text-3xl font-bold uppercase">Payment confirmed</h1>
        <p className="mt-3 text-[#9a9ab0]">
          {found.item.name} · <span className="font-mono text-[#22d3ee]">{fmtEur(found.item.cents)}</span>
          {typeof card === "string" ? ` · card ••${card}` : ""}. Ships tomorrow.
        </p>
        <Link href="/shops/games" className="mt-6 inline-block border border-[#22d3ee] px-5 py-3 font-mono text-sm uppercase tracking-widest text-[#22d3ee]">
          Keep shopping
        </Link>
        <BackToBalance className="mt-14 border border-dashed border-[#2a2a3a] p-4 text-sm text-[#9a9ab0]" />
      </div>
    </GamesFrame>
  );
}
