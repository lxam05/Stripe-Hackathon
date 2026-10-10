import Image from "next/image";
import { Ban, CreditCard, LoaderCircle, Snowflake } from "lucide-react";
import { cx } from "./ui";
import { LogoMark } from "./logo";

const EVENT_ART: Record<string, string> = {
  social: "/art/card-social.webp",
  academic: "/art/card-academic.webp",
  sport: "/art/card-sport.webp",
  trip: "/art/card-trip.webp",
  other: "/art/card-social-alt.webp",
};

/** Cover art for an event type. */
export function cardArt(type: string) {
  return EVENT_ART[type] ?? EVENT_ART.other;
}

const ROLE_ART: Record<string, string> = {
  treasurer: "/art/card-academic.webp",
  events_officer: "/art/card-social.webp",
  chair: "/art/card-sport.webp",
  secretary: "/art/card-social-alt.webp",
  pro: "/art/card-trip.webp",
};

/** Each officer's card has its own artwork so the five are easy to tell apart. */
export function roleArt(role: string) {
  return ROLE_ART[role] ?? EVENT_ART.other;
}

export function VirtualCard({
  title,
  art,
  societyName,
  holder,
  last4,
  expMonth,
  expYear,
  status,
  tag,
  size = "md",
  network = "mock",
}: {
  /** Big text on the card, e.g. the officer's role. */
  title: string;
  art: string;
  societyName: string;
  holder: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: string;
  /** Small chip, e.g. which event the card is spending for. */
  tag?: string;
  size?: "sm" | "md";
  network?: string;
}) {
  const frozen = status === "inactive";
  const cancelled = status === "canceled";
  const pending = status === "pending";
  return (
    <div
      className={cx(
        "card-sheen relative aspect-[1.586] w-full overflow-hidden rounded-[18px] text-white shadow-[var(--shadow-lift)] select-none",
        size === "sm" ? "max-w-[260px]" : "max-w-[380px]",
      )}
      aria-label={`${title} card for ${holder}, ending ${last4}, ${frozen ? "frozen" : cancelled ? "cancelled" : pending ? "pending" : "active"}`}
    >
      <Image src={art} alt="" fill sizes="380px" className={cx("object-cover", (frozen || cancelled) && "grayscale-[0.6]")} priority={size === "md"} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
      <div className={cx("relative flex h-full flex-col justify-between", size === "sm" ? "p-3.5" : "p-5")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cx("truncate font-medium opacity-80", size === "sm" ? "text-[10px]" : "text-xs")}>{societyName}</div>
            <div className={cx("display truncate leading-tight", size === "sm" ? "text-lg" : "text-2xl")}>{title}</div>
            {tag && (
              <div
                className={cx(
                  "mt-1 inline-flex max-w-full items-center truncate rounded-full bg-black/30 font-medium backdrop-blur-sm",
                  size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
                )}
              >
                <span className="truncate">{tag}</span>
              </div>
            )}
          </div>
          <LogoMark size={size === "sm" ? 22 : 28} />
        </div>
        <div>
          <div className={cx("font-mono tracking-[0.18em] tabular", size === "sm" ? "text-sm" : "text-lg")}>
            •••• •••• •••• {last4}
          </div>
          <div className={cx("mt-1 flex items-end justify-between opacity-90", size === "sm" ? "text-[10px]" : "text-xs")}>
            <span className="truncate uppercase tracking-wider">{holder}</span>
            <span className="tabular">
              {pending ? "--/--" : `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`} · VIRTUAL{network === "mock" ? " · SIM" : ""}
            </span>
          </div>
        </div>
      </div>
      {(frozen || cancelled || pending) && (
        <div className={cx("absolute inset-0 flex items-center justify-center backdrop-blur-[3px]", frozen ? "bg-sky-100/35" : cancelled ? "bg-black/45" : "bg-black/30")}>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink shadow">
            {frozen && (
              <>
                <Snowflake className="h-4 w-4 text-info" /> Frozen
              </>
            )}
            {cancelled && (
              <>
                <Ban className="h-4 w-4 text-bad" /> Cancelled
              </>
            )}
            {pending && (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin text-warn" /> Issuing…
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/** Wide banner for an event, using its type's artwork. */
export function EventCover({ name, type, typeLabel, size = "sm" }: { name: string; type: string; typeLabel: string; size?: "sm" | "md" }) {
  return (
    <div className={cx("relative w-full overflow-hidden rounded-xl text-white", size === "sm" ? "aspect-[2.6]" : "aspect-[2.2]")}>
      <Image src={cardArt(type)} alt="" fill sizes="420px" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
      <div className={cx("absolute inset-x-0 bottom-0", size === "sm" ? "p-3" : "p-4")}>
        <div className={cx("font-medium uppercase tracking-[0.14em] opacity-85", size === "sm" ? "text-[10px]" : "text-[11px]")}>{typeLabel}</div>
        <div className={cx("display truncate leading-tight", size === "sm" ? "text-xl" : "text-2xl")}>{name}</div>
      </div>
    </div>
  );
}

/** "Cian's card" / "2 cards" / "No card assigned" for an event tile. */
export function CardHolders({ cards }: { cards: { holder_name: string; status: string }[] }) {
  const live = cards.filter((c) => c.status === "active" || c.status === "inactive");
  if (!live.length) return <span className="text-xs text-warn">No card assigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
      <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{live.length === 1 ? `${live[0].holder_name.split(" ")[0]}'s card` : `${live.length} cards`}</span>
    </span>
  );
}
