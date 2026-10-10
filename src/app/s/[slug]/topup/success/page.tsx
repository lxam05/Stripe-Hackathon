import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { TopUpStatus } from "@/components/topup-status";
import { getDb } from "@/lib/db";
import { confirmCheckoutSession } from "@/lib/payments";
import { fmtEur } from "@/lib/money";
import { getSocietyBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thank you" };

export default async function TopUpSuccess({ params, searchParams }: PageProps<"/s/[slug]/topup/success">) {
  const { slug } = await params;
  const sessionId = (await searchParams).session_id;
  const soc = getSocietyBySlug(slug);
  if (!soc || typeof sessionId !== "string") notFound();
  // Retrieve the session server-side; credits the ledger idempotently if Stripe says it's paid.
  let paid = false;
  try {
    paid = (await confirmCheckoutSession(sessionId)).paid;
  } catch {
    paid = false;
  }
  const t = getDb().prepare(`SELECT * FROM topup WHERE checkout_session_id=?`).get(sessionId) as
    | { amount_cents: number; payer_name: string; status: string }
    | undefined;
  if (!t) notFound();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[720px] items-center justify-between px-5 py-5">
        <Logo size={26} />
      </header>
      <main className="mx-auto max-w-[560px] px-5 pb-16 text-center">
        <Image src="/art/sponsor.webp" alt="" width={360} height={270} className="mx-auto feather" priority />
        <TopUpStatus sessionId={sessionId} initiallyPaid={paid || t.status === "paid"}>
          <h1 className="display text-5xl leading-tight">{fmtEur(t.amount_cents)} added to {soc.name}.</h1>
          <p className="mt-3 text-lg text-ink-2">Thank you, {t.payer_name}. It&rsquo;s already in the society&rsquo;s budget.</p>
        </TopUpStatus>
        <div className="mt-8 flex justify-center gap-2">
          <Link href={`/s/${soc.slug}/topup`} className="rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm hover:bg-paper-2">
            Make another top-up
          </Link>
          <Link href="/funding" className="rounded-full bg-stone px-4 py-2.5 text-sm text-white hover:bg-stone-2">
            Treasurer view →
          </Link>
        </div>
      </main>
    </div>
  );
}
