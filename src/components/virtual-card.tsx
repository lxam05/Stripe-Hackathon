import Image from "next/image";
import { Ban, LoaderCircle, Snowflake } from "lucide-react";
import { cx } from "./ui";
import { LogoMark } from "./logo";

const ART: Record<string, string> = {
  social: "/art/card-social.webp",
  academic: "/art/card-academic.webp",
  sport: "/art/card-sport.webp",
  trip: "/art/card-trip.webp",
  other: "/art/card-social-alt.webp",
};

export function cardArt(type: string) {
  return ART[type] ?? ART.other;
}

export function VirtualCard({
  eventName,
  eventType,
  societyName,
  holder,
  last4,
  expMonth,
  expYear,
  status,
  size = "md",
  network = "mock",
}: {
  eventName: string;
  eventType: string;
  societyName: string;
  holder: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: string;
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
      aria-label={`Virtual card for ${eventName}, ending ${last4}, ${frozen ? "frozen" : cancelled ? "cancelled" : pending ? "pending" : "active"}`}
    >
      <Image src={cardArt(eventType)} alt="" fill sizes="380px" className={cx("object-cover", (frozen || cancelled) && "grayscale-[0.6]")} priority={size === "md"} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
      <div className={cx("relative flex h-full flex-col justify-between", size === "sm" ? "p-3.5" : "p-5")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={cx("truncate font-medium opacity-80", size === "sm" ? "text-[10px]" : "text-xs")}>{societyName}</div>
            <div className={cx("display truncate leading-tight", size === "sm" ? "text-lg" : "text-2xl")}>{eventName}</div>
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
