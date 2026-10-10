import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { CampusShop } from "@/components/campus-shop";
import { button } from "@/components/ui";
import { canSeeOwned } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getActor } from "@/lib/session";

export const metadata = { title: "Campus marketplace" };

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getActor();
  if (!actor) redirect("/");
  const { card: cardId } = await searchParams;
  const card = getDb().prepare(
    `SELECT c.id, c.society_id, c.member_id, c.last4, c.status, m.name cardholder, s.name society_name
     FROM card c JOIN member m ON m.id=c.member_id JOIN society s ON s.id=c.society_id WHERE c.id=?`,
  ).get(typeof cardId === "string" ? cardId : "") as {
    id: string; society_id: string; member_id: string; last4: string; status: string; cardholder: string; society_name: string;
  } | undefined;
  if (!card || !canSeeOwned(actor, card)) redirect("/cards");

  return (
    <main className="min-h-screen bg-[#f5e8d8]">
      <header className="border-b border-[#dfcdb7] bg-[#fffaf2]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-butter/35 px-3 py-1.5 text-xs font-medium text-stone sm:inline">Demo marketplace · sandbox</span>
            <Link href="/cards" className={button("secondary")}><ArrowLeft className="h-4 w-4" /> Back to Balance</Link>
          </div>
        </div>
      </header>
      <CampusShop card={{ id: card.id, last4: card.last4, cardholder: card.cardholder, societyName: card.society_name, status: card.status }} />
    </main>
  );
}
