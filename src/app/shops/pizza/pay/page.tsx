import { notFound } from "next/navigation";
import { ShopCardForm } from "@/components/shop-card-form";
import { PIZZA_FORM, PizzaFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { shopItem } from "@/lib/shops";

export const metadata = { title: { absolute: "Checkout · Slice Republic" } };

export default async function PizzaPay({ searchParams }: PageProps<"/shops/pizza/pay">) {
  const { item: itemId, error } = await searchParams;
  const found = shopItem("pizza", typeof itemId === "string" ? itemId : "");
  if (!found) notFound();
  return (
    <PizzaFrame>
      <h1 className="text-3xl font-black">Checkout</h1>
      <div className="mt-4 flex justify-between rounded-2xl border-4 border-[#2b1a0e] bg-white p-4 font-bold">
        <span>{found.item.name}</span>
        <span>{fmtEur(found.item.cents)}</span>
      </div>
      <h2 className="mb-3 mt-8 text-xl font-black">Pay by card</h2>
      <ShopCardForm shop="pizza" item={found.item.id} total={fmtEur(found.item.cents)} error={typeof error === "string" ? error : null} theme={PIZZA_FORM} />
    </PizzaFrame>
  );
}
