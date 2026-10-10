import Link from "next/link";
import { Logo } from "@/components/logo";
import { cancelTopUp } from "@/lib/payments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment cancelled" };

export default async function TopUpCancel({ params, searchParams }: PageProps<"/s/[slug]/topup/cancel">) {
  const { slug } = await params;
  const topup = (await searchParams).topup;
  if (typeof topup === "string") cancelTopUp(topup); // F5: no ledger entry
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[720px] items-center px-5 py-5">
        <Logo size={26} />
      </header>
      <main className="mx-auto max-w-[520px] px-5 py-16 text-center">
        <h1 className="display text-5xl">No payment was taken.</h1>
        <p className="mt-3 text-lg text-ink-2">You left checkout before paying. Nothing was charged.</p>
        <Link href={`/s/${slug}/topup`} className="mt-8 inline-flex rounded-full bg-stone px-5 py-3 text-white hover:bg-stone-2">
          Try again
        </Link>
      </main>
    </div>
  );
}
