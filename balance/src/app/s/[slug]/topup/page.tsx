import Image from "next/image";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { TopUpForm } from "@/components/topup-form";
import { ensureSeeded } from "@/lib/bootstrap";
import { stripeEnabled } from "@/lib/env";
import { fmtEur } from "@/lib/money";
import { getSocietyBySlug, listTopUps } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/s/[slug]/topup">) {
  await ensureSeeded();
  const soc = getSocietyBySlug((await params).slug);
  return { title: soc ? `Sponsor ${soc.name}` : "Sponsor a society" };
}

export default async function TopUpPage({ params }: PageProps<"/s/[slug]/topup">) {
  await ensureSeeded();
  const { slug } = await params;
  const soc = getSocietyBySlug(slug);
  if (!soc) notFound();
  const publicSponsors = listTopUps(soc.id, 50).filter((t) => t.payer_type === "sponsor" && t.show_publicly).slice(0, 4);
  const yearTotal = listTopUps(soc.id, 200)
    .filter((t) => t.paid_at >= "2026-09-01")
    .reduce((s, t) => s + t.amount_cents, 0);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1080px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo size={26} />
        <span className="rounded-full bg-butter/40 px-3 py-1 text-xs text-[#6b4d12]">Sandbox · test payments only</span>
      </header>
      <main className="mx-auto grid max-w-[1080px] gap-8 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1fr_440px] lg:items-start">
        <section>
          <div className="flex items-center gap-4">
            <Image src={soc.icon} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl shadow-[var(--shadow-card)]" priority />
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">Support</p>
              <h1 className="display text-4xl leading-tight sm:text-5xl">{soc.name}</h1>
            </div>
          </div>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">{soc.blurb}</p>
          <div className="relative mt-6 hidden aspect-[4/3] max-w-md lg:block">
            <Image src="/art/sponsor.webp" alt="" fill sizes="440px" className="object-contain feather" />
          </div>
          <ul className="mt-6 space-y-2 text-sm text-ink-2">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ok" /> Your money goes straight into the society&rsquo;s budget, not anyone&rsquo;s pocket.
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ok" /> Every euro is spent on event cards with built-in limits and AI review.
            </li>
          </ul>
          {(publicSponsors.length > 0 || yearTotal > 0) && (
            <div className="mt-6 rounded-2xl border border-line bg-surface/70 p-4 text-sm">
              {yearTotal > 0 && (
                <p>
                  <b className="tabular">{fmtEur(yearTotal)}</b> raised this academic year.
                </p>
              )}
              {publicSponsors.length > 0 && <p className="mt-1 text-ink-2">With thanks to {[...new Set(publicSponsors.map((s) => s.payer_name))].join(", ")}.</p>}
            </div>
          )}
        </section>
        <section className="rise" style={{ animationDelay: "100ms" }}>
          <TopUpForm slug={soc.slug} societyName={soc.name} simulated={!stripeEnabled()} />
        </section>
      </main>
    </div>
  );
}
