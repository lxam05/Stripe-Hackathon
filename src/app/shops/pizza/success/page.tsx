import Link from "next/link";
import { notFound } from "next/navigation";
import { Pizza } from "lucide-react";
import { BackToBalance, PizzaFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { shopItem } from "@/lib/shops";

export const metadata = { title: { absolute: "Order placed · Slice Republic" } };

/** Reached only after the card was approved; declines go back to the payment form. */
export default async function PizzaSuccess({ searchParams }: PageProps<"/shops/pizza/success">) {
  const { item: itemId, card } = await searchParams;
  const found = shopItem("pizza", typeof itemId === "string" ? itemId : "");
  if (!found) notFound();
  return (
    <PizzaFrame>
      <div className="text-center">
        <Pizza className="mx-auto h-14 w-14 text-[#e63312]" strokeWidth={2.5} />
        <h1 className="mt-4 text-4xl font-black">Order placed!</h1>
        <p className="mt-2">
          {found.item.name} · {fmtEur(found.item.cents)} paid{typeof card === "string" ? ` with card ••${card}` : ""}. Your pizza is in the oven.
        </p>
        <Link href="/shops/pizza" className="mt-6 inline-block rounded-full bg-[#e63312] px-5 py-3 font-black text-white shadow-[0_4px_0_#2b1a0e]">
          Order more
        </Link>
        <BackToBalance className="mt-14 rounded-xl border-2 border-dashed border-[#2b1a0e]/30 p-4 text-sm" />
      </div>
    </PizzaFrame>
  );
}
