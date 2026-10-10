import type { Signal } from "./authorize";
import { mccInfo } from "./mcc";
import { fmtDate, fmtEur } from "./money";

// Plain-language versions of the risk engine's signals, for people rather than reviewers of the
// engine itself. The technical view (codes, points, scores, model output) lives on /engine.

const money = (s: string) => s.match(/€[\d,]+(\.\d+)?/g) ?? [];

/** One sentence a treasurer or cardholder understands, without codes or scores. */
export function plainSignal(s: Signal): string {
  const mcc = typeof s.data?.mcc === "string" ? mccInfo(s.data.mcc).label.toLowerCase() : null;
  const m = money(s.evidence);
  switch (s.id) {
    case "H1":
      return s.label === "Card entitlement inactive"
        ? "The society plan for this card isn't active."
        : s.evidence.includes("frozen")
          ? "The card was frozen."
          : "The card wasn't active.";
    case "H2": {
      const d = s.data as { purchase_date?: string; earliest?: string; latest?: string } | undefined;
      return d?.earliest && d.latest
        ? `Bought outside the event's spending dates (${fmtDate(d.earliest)} – ${fmtDate(d.latest)}).`
        : "Bought outside the event's spending dates.";
    }
    case "H3":
      return `There wasn't enough money in the society account${m[1] ? ` (${m[1]} available)` : ""}.`;
    case "H4":
      return `${cap(mcc ?? "This kind of shop")} isn't allowed on society cards under UCD policy.`;
    case "H5":
      return `Over the card's ${m[1] ?? ""} per-purchase review limit.`.replace("  ", " ");
    case "H6":
      return `Takes the card past its ${m[2] ?? ""} monthly limit.`.replace("  ", " ");
    case "E1":
      return `More than what's left in the event budget${m[1] ? ` (${m[1]})` : ""}.`;
    case "R1":
      return `${cap(mcc ?? "This category")} purchases get a quick check for this kind of spending.`;
    case "R2":
      return mcc ? `A new kind of purchase for the society: ${mcc}.` : "A new kind of purchase for the society.";
    case "R3": {
      const x = s.evidence.match(/^([\d.]+)×/)?.[1];
      const median = typeof s.data?.median_cents === "number" ? fmtEur(s.data.median_cents) : null;
      return `Much bigger than usual${x ? `: about ${x}× the typical` : ""}${median ? ` ${median}` : ""} for this kind of purchase.`;
    }
    case "R4":
      return "Close to the card's per-purchase limit.";
    case "R5":
      return "Several large purchases on this card in one day, which can mean a purchase was split.";
    case "R6":
      return "Lots of attempts on this card within a few minutes.";
    case "R7":
      return `Made at an unusual hour${typeof s.data?.local_time === "string" ? ` (${s.data.local_time})` : ""}.`;
    case "R8":
      return "The shop is abroad, and this isn't a trip.";
    case "R9":
      return "Looks like a repeat of a purchase made in the last day.";
    case "R10":
      return "Not something this cardholder usually buys.";
    case "R11":
      return "A large, perfectly round amount.";
    case "R12":
      return "The card was issued only days ago.";
    case "R13":
      return "The shop's name contains odd text that looks like an instruction.";
    default:
      return plainText(s.evidence);
  }
}

/** Strip engine jargon (MCC codes, z-scores) from stored free text such as review reasons. */
export function plainText(text: string): string {
  return text
    .replace(/\bMCC \d{4} \(([^)]+)\)/g, (_, l: string) => l.toLowerCase())
    .replace(/\bMCC \d{4}\b/g, "this category")
    .replace(/,? ?z=-?[\d.]+/g, "")
    .replace(/^Declined: /, "")
    .replace(/^Rules score \d+: /, "");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const NEXT_STEP: Record<string, string> = {
  review: "Take a quick look and approve it if it's expected.",
  request_receipt: "Ask the cardholder for a receipt.",
  freeze_card: "Consider freezing the card until you've spoken to the cardholder.",
};
