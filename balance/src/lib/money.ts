const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const eurRound = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const fmtEur = (cents: number) => eur.format(cents / 100);
export const fmtEurShort = (cents: number) =>
  cents % 100 === 0 ? eurRound.format(cents / 100) : eur.format(cents / 100);

/** Parse a user-typed euro amount ("12", "12.5", "€1,234.56") into integer cents. */
export function parseEuroToCents(input: string): number | null {
  const cleaned = input.replace(/[€,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export const TZ = "Europe/Dublin";

const dtf = new Intl.DateTimeFormat("en-IE", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const df = new Intl.DateTimeFormat("en-IE", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));
export const fmtDate = (isoOrDate: string) =>
  df.format(new Date(isoOrDate.length === 10 ? `${isoOrDate}T12:00:00Z` : isoOrDate));

/** Local (Dublin) wall-clock parts for an instant. */
export function dublinParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    time: `${String(hour).padStart(2, "0")}:${get("minute")}`,
  };
}

/** Convert a Dublin local date + time ("2026-10-10", "02:14") to a UTC ISO string. */
export function dublinToIso(date: string, time: string): string {
  // Try both possible offsets (IST +01:00 / GMT +00:00) and keep the one that round-trips.
  for (const offset of ["+01:00", "+00:00"]) {
    const iso = new Date(`${date}T${time}:00${offset}`).toISOString();
    const p = dublinParts(iso);
    if (p.date === date && p.time === time) return iso;
  }
  return new Date(`${date}T${time}:00Z`).toISOString();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function relativeTime(iso: string, now = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(iso);
}
