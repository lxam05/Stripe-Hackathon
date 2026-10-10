import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { RolePicker, type Persona } from "@/components/role-picker";
import { ensureSeeded } from "@/lib/bootstrap";
import { listMembers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSeeded();
  const members = listMembers();
  const aoife = members.find((m) => m.id === "mem_drama_1")!;
  const cian = members.find((m) => m.id === "mem_drama_2")!;
  const personas: Persona[] = [
    { actor: aoife.id, name: aoife.name, role: "Treasurer", detail: aoife.society_name, image: "/art/persona-treasurer.webp", recommended: true },
    { actor: cian.id, name: cian.name, role: "Events officer · cardholder", detail: cian.society_name, image: "/art/persona-officer.webp" },
    { actor: "admin", name: "Societies Office", role: "UCD admin", detail: "All societies, policy & flags", image: "/art/persona-admin.webp" },
  ];
  const others: Persona[] = members
    .filter((m) => m.role === "treasurer" && m.id !== aoife.id)
    .map((m) => ({ actor: m.id, name: m.name, role: "Treasurer", detail: m.society_name, image: m.society_icon }));

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link href="/s/drama/topup" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface/70 px-3.5 py-2 text-sm text-ink hover:bg-surface">
          Sponsor a society <ArrowUpRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64%] lg:block">
          <Image src="/art/hero.webp" alt="" fill priority sizes="64vw" className="object-cover object-[62%_50%]" />
          <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-paper to-transparent" />
        </div>
        <div className="relative mx-auto max-w-[1180px] px-5 pb-10 pt-6 sm:px-8 lg:min-h-[560px] lg:pt-20">
          <div className="max-w-xl rise">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1 text-xs font-medium text-stone ring-1 ring-line">
              <Sparkles className="h-3.5 w-3.5 text-coral" /> HackUCD 2026 · FinTech &amp; risk
            </p>
            <h1 className="display text-[3.4rem] leading-[0.98] text-ink sm:text-7xl">
              Society money,
              <br />
              <em className="text-stone-2">kept in balance.</em>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
              Every event gets its own virtual card with a budget built in. Every purchase is checked twice: by hard rules in
              real time, then by <b className="font-semibold text-ink">JEV</b>, an AI analyst that explains anything odd in
              plain English. No more fronting costs, chasing receipts or a spreadsheet nobody trusts.
            </p>
          </div>
          <div className="relative mt-8 aspect-[16/9] overflow-hidden rounded-3xl lg:hidden">
            <Image src="/art/hero.webp" alt="" fill sizes="100vw" className="object-cover object-[75%_50%]" />
          </div>

        </div>
      </section>

      <section className="relative mx-auto max-w-[1180px] px-5 pb-12 pt-8 sm:px-8 rise" style={{ animationDelay: "120ms" }}>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-2">Try the demo as…</h2>
        <div className="max-w-4xl">
          <RolePicker personas={personas} others={others} />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-4 px-5 pb-16 sm:grid-cols-3 sm:px-8">
        {[
          { Icon: CreditCard, title: "A card per event", body: "Treasurers create “Pizza Night, €300” and the events officer gets a virtual card with that limit, blocked categories and dates attached." },
          { Icon: ShieldCheck, title: "Rules decide, instantly", body: "Budget, blocked merchants, event dates and twelve risk signals are checked inside the card network’s authorisation window." },
          { Icon: Sparkles, title: "JEV explains", body: "An AI analyst (via OpenRouter) compares each purchase with the society’s history and flags what doesn’t fit, with evidence you can check." },
        ].map(({ Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-line bg-surface/80 p-5">
            <Icon className="h-5 w-5 text-coral" aria-hidden />
            <h3 className="display mt-3 text-2xl text-ink">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">
        Sandbox demo. Stripe test mode only, no real money. All societies, people and purchases are synthetic.
      </footer>
    </div>
  );
}
