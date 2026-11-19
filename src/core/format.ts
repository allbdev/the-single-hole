import { translate, type Locale, type MessageKey } from "../i18n";

/** The hole is in inland São Paulo: clocks and "since" times use Brasília time. */
export const HOLE_TIME_ZONE = "America/Sao_Paulo";

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numberFormats.set(key, f);
  }
  return f;
}

/** Whole numbers: 9.381.220 (PT-BR) / 9,381,220 (EN). */
export function formatCount(n: number, locale: Locale): string {
  return nf(locale, { maximumFractionDigits: 0 }).format(Math.floor(Number.isFinite(n) ? n : 0));
}

/** Depth: meters with one decimal below 100 km (8.919,4 m), whole km above (2.900 km). */
export function formatDepth(meters: number, locale: Locale): string {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (m >= 100_000) return `${nf(locale, { maximumFractionDigits: 0 }).format(Math.floor(m / 1000))} km`;
  return `${nf(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.floor(m * 10) / 10)} m`;
}

/** Just the number part of `formatDepth`, for big displays that print the unit separately. */
export function splitDepth(meters: number, locale: Locale): { value: string; unit: string } {
  const text = formatDepth(meters, locale);
  const i = text.lastIndexOf(" ");
  return { value: text.slice(0, i), unit: text.slice(i + 1) };
}

/** Distances: whole meters below 10 km, km with one decimal below 100 km, whole km above. */
export function formatDistance(meters: number, locale: Locale): string {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  if (m < 10_000) return `${nf(locale, { maximumFractionDigits: 0 }).format(Math.round(m))} m`;
  if (m < 100_000) {
    return `${nf(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000)} km`;
  }
  return `${nf(locale, { maximumFractionDigits: 0 }).format(Math.round(m / 1000))} km`;
}

/** A nice round distance for the feed ("+1.000 m"). */
export function formatRoundMeters(meters: number, locale: Locale): string {
  return `${nf(locale, { maximumFractionDigits: 0 }).format(Math.round(meters))} m`;
}

/** Percent of the way: 0,07% / 12,5% / 64%. */
export function formatPercent(fraction: number, locale: Locale): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const pct = f * 100;
  const digits = pct < 1 ? 2 : pct < 10 ? 1 : 0;
  const factor = 10 ** digits;
  const floored = Math.floor(pct * factor + 1e-9) / factor;
  return `${nf(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(floored)}%`;
}

const MS = { year: 365 * 86_400_000, day: 86_400_000, hour: 3_600_000, minute: 60_000, second: 1_000 };
type Unit = keyof typeof MS;

function unit(locale: Locale, u: Unit, n: number): string {
  const key = `unit.${u}.${n === 1 ? "one" : "other"}` as MessageKey;
  return translate(locale, key, { n: formatCount(n, locale) });
}

/**
 * Durations, at most two units: "5 anos, 41 dias", "6 dias", "4 min", "12 s".
 */
export function formatDuration(ms: number, locale: Locale): string {
  const d = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const years = Math.floor(d / MS.year);
  const days = Math.floor((d % MS.year) / MS.day);
  const join = translate(locale, "unit.join");
  if (years > 0)
    return days > 0
      ? unit(locale, "year", years) + join + unit(locale, "day", days)
      : unit(locale, "year", years);
  if (days > 0) return unit(locale, "day", days);
  const hours = Math.floor(d / MS.hour);
  if (hours > 0) return unit(locale, "hour", hours);
  const minutes = Math.floor(d / MS.minute);
  if (minutes > 0) return unit(locale, "minute", minutes);
  return unit(locale, "second", Math.floor(d / MS.second));
}

/** Short age for the feed: "12 s", "3 min", "2 h". */
export function formatAgo(ms: number, locale: Locale): string {
  const d = Math.max(0, ms);
  if (d < MS.minute) return unit(locale, "second", Math.floor(d / MS.second));
  if (d < MS.hour) return unit(locale, "minute", Math.floor(d / MS.minute));
  if (d < MS.day) return unit(locale, "hour", Math.floor(d / MS.hour));
  return unit(locale, "day", Math.floor(d / MS.day));
}

/** Brasília clock: "04:12". */
export function formatClock(epochMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: HOLE_TIME_ZONE,
  }).format(epochMs);
}

/** "terça, 14h02" / "Tuesday, 14:02" within a week; a date beyond that. */
export function formatSince(epochMs: number, nowMs: number, locale: Locale): string {
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: HOLE_TIME_ZONE,
  }).format(epochMs);
  const t = locale === "pt-BR" ? time.replace(":", "h") : time;
  if (nowMs - epochMs < 6 * MS.day) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: HOLE_TIME_ZONE })
      .format(epochMs)
      .replace(/-feira$/, "");
    return `${weekday}, ${t}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: HOLE_TIME_ZONE,
  }).format(epochMs);
  return `${date}, ${t}`;
}

/** Hour of day (0..24, fractional) at the hole, for lighting. */
export function holeHour(epochMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: HOLE_TIME_ZONE,
  }).formatToParts(epochMs);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) + m / 60;
}

const regionNames = new Map<Locale, Intl.DisplayNames>();
/** Country display name; "Somewhere" / "Algum lugar" for unknown. Countries only, never cities. */
export function countryName(code: string, locale: Locale): string {
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return translate(locale, "country.unknown");
  let dn = regionNames.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: "region" });
    regionNames.set(locale, dn);
  }
  try {
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Year the hole reaches Japan at a given pace, or null with no pace. */
export function etaYear(
  remainingScoops: number,
  week: { scoops: number; spanMs: number },
  nowMs: number,
): number | null {
  if (week.scoops <= 0 || week.spanMs <= 0) return null;
  const perMs = week.scoops / week.spanMs;
  const eta = nowMs + Math.max(0, remainingScoops) / perMs;
  if (!Number.isFinite(eta) || eta > 8.64e15) return null;
  return new Date(eta).getUTCFullYear();
}
