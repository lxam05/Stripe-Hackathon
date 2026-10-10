import Link from "next/link";
import { PizzaFrame } from "@/components/shop-frames";
import { fmtEur } from "@/lib/money";
import { SHOPS } from "@/lib/shops";

export const metadata = { title: { absolute: "Slice Republic · Pizza in Rathmines" } };

export default function PizzaShop() {
  return (
    <PizzaFrame>
      <h1 className="text-3xl font-black">Order pizza</h1>
      <p className="mt-1 text-sm">Rathmines · delivery in about 30 min</p>
      <ul className="mt-6 space-y-3">
        {SHOPS.pizza.items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 rounded-2xl border-4 border-[#2b1a0e] bg-white p-4">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black">{item.name}</div>
              <div className="text-sm">{item.blurb}</div>
            </div>
            <Link
              href={`/shops/pizza/pay?item=${item.id}`}
              className="rounded-full bg-[#e63312] px-5 py-3 font-black text-white shadow-[0_4px_0_#2b1a0e] active:translate-y-1 active:shadow-none"
            >
              Order · {fmtEur(item.cents)}
            </Link>
          </li>
        ))}
      </ul>
    </PizzaFrame>
  );
}
