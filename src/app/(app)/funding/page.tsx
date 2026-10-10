import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader, Panel, Pill, SectionTitle, StatTile, button } from "@/components/ui";
import { requireTreasurer } from "@/lib/guard";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { fmtDate, fmtEur } from "@/lib/money";
import { getSociety, listTopUps, societyOverview } from "@/lib/queries";

export const metadata = { title: "Funding" };

const TYPE_LABEL: Record<string, string> = {
  topup: "Top-up",
  adjustment: "Adjustment",
  transfer_out: "Transfer out",
  auth_hold: "Hold",
  hold_release: "Hold released",
  spend: "Spend",
  refund: "Refund",
};

export default async function FundingPage() {
  const actor = await requireTreasurer();
  const soc = getSociety(actor.societyId)!;
  const url = `${env.appUrl}/s/${soc.slug}/topup`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#16201c", light: "#00000000" } });
  const topups = listTopUps(soc.id, 30);
  const o = societyOverview(soc.id);
  const ledger = getDb()
    .prepare(`SELECT * FROM ledger_entry WHERE society_id=? ORDER BY id DESC LIMIT 12`)
    .all(soc.id) as { id: number; type: string; amount_cents: number; memo: string; created_at: string }[];
  const sign = (t: string) => (["topup", "adjustment", "refund", "hold_release"].includes(t) ? "+" : "−");

  return (
    <>
      <PageHeader eyebrow={soc.name} title="Funding">
        Sponsors and UCD top up your budget with one link. Money appears in the ledger as soon as Stripe confirms payment.
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-2xl border border-line bg-white p-4">
              <div className="h-36 w-36 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for the sponsor link" role="img" />
            </div>
            <div className="min-w-0">
              <h2 className="display text-3xl">Your sponsor link</h2>
              <p className="mt-1 text-sm text-ink-2">Print the QR code on posters, or send the link with your sponsorship pack.</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 font-mono text-[13px]">
                <span className="truncate">{url}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={url} />
                <Link href={`/s/${soc.slug}/topup`} className={button("secondary")} target="_blank">
                  <ExternalLink className="h-4 w-4" /> Open page
                </Link>
              </div>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Available" cents={o.available} />
          <StatTile label="Funded this year" cents={topups.filter((t) => t.paid_at >= "2026-09-01").reduce((s, t) => s + t.amount_cents, 0)} hint="Since 1 Sept 2026" />
          <div className="col-span-2 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
            <Image src="/art/sponsor.webp" alt="" width={110} height={82} className="feather" />
            <p className="text-sm text-ink-2">
              Every top-up is a Stripe Checkout payment, credited once and only once, even if Stripe retries the webhook.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionTitle>Top-ups</SectionTitle>
          <Panel pad={false}>
            <ul className="divide-y divide-line">
              {topups.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-3">No top-ups yet. Share your link!</li>}
              {topups.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.payer_name}</div>
                    <div className="truncate text-xs text-ink-3">
                      {fmtDate(t.paid_at)}
                      {t.message && <> · “{t.message}”</>}
                    </div>
                  </div>
                  <Pill className={t.payer_type === "ucd" ? "bg-info-bg text-info" : "bg-mint/60 text-stone"}>{t.payer_type === "ucd" ? "UCD grant" : "Sponsor"}</Pill>
                  <span className="w-24 text-right font-medium tabular text-ok">+{fmtEur(t.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="min-w-0">
          <SectionTitle aside="append-only">Ledger</SectionTitle>
          <Panel pad={false}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 pl-5 pr-2 text-xs text-ink-3 tabular">{fmtDate(l.created_at)}</td>
                    <td className="px-2 py-2.5">{TYPE_LABEL[l.type] ?? l.type}</td>
                    <td className="max-w-[160px] truncate px-2 py-2.5 text-ink-3">{l.memo}</td>
                    <td className="py-2.5 pl-2 pr-5 text-right tabular">
                      {sign(l.type)}
                      {fmtEur(l.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
