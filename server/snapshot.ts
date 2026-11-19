import { ARRIVAL_SCOOPS, LAYERS } from "../shared/data/layers";
import type { FameEntry, SeasonInfo } from "../shared/protocol";

export const SNAPSHOT_VERSION = 1;
export const MAX_FAME_ENTRIES = 100;

/** Everything the room needs to survive a restart. Small: a few KB. */
export interface Snapshot {
  v: number;
  savedAt: number;
  season: SeasonInfo;
  total: number;
  /** Scoops this season by country. */
  countries: Record<string, number>;
  /** [UTC day number, scoops] for the last days, for the weekly pace. */
  days: [number, number][];
  fame: FameEntry[];
}

export function emptySnapshot(now: number): Snapshot {
  return {
    v: SNAPSHOT_VERSION,
    savedAt: now,
    season: { number: 1, startedAt: now, layerEnteredAt: LAYERS.map((_, i) => (i === 0 ? now : null)) },
    total: 0,
    countries: {},
    days: [],
    fame: [],
  };
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isCount = (x: unknown): x is number => isNum(x) && Number.isSafeInteger(x) && x >= 0;

function validFame(e: unknown): e is FameEntry {
  if (typeof e !== "object" || e === null) return false;
  const f = e as Record<string, unknown>;
  return (
    isCount(f.season) &&
    isNum(f.startedAt) &&
    isNum(f.endedAt) &&
    isCount(f.scoops) &&
    isCount(f.onlineAtArrival) &&
    Array.isArray(f.topCountries) &&
    f.topCountries.every(
      (c: unknown) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { code?: unknown }).code === "string" &&
        isCount((c as { scoops?: unknown }).scoops),
    )
  );
}

/** Validate an untrusted parsed snapshot. Returns null when anything is off. */
export function validateSnapshot(data: unknown): Snapshot | null {
  if (typeof data !== "object" || data === null) return null;
  const s = data as Record<string, unknown>;
  if (s.v !== SNAPSHOT_VERSION || !isNum(s.savedAt)) return null;
  if (!isCount(s.total) || s.total > ARRIVAL_SCOOPS) return null;
  const season = s.season as Record<string, unknown> | null;
  if (typeof season !== "object" || season === null) return null;
  if (!isCount(season.number) || season.number < 1 || !isNum(season.startedAt)) return null;
  const entered = season.layerEnteredAt;
  if (!Array.isArray(entered) || entered.length !== LAYERS.length) return null;
  if (!entered.every((x) => x === null || isNum(x))) return null;
  const countries = s.countries;
  if (typeof countries !== "object" || countries === null || Array.isArray(countries)) return null;
  for (const [k, v] of Object.entries(countries)) {
    if (!/^[A-Z]{2}$/.test(k) || !isCount(v)) return null;
  }
  if (!Array.isArray(s.days) || !s.days.every((d) => Array.isArray(d) && isCount(d[0]) && isCount(d[1]))) {
    return null;
  }
  if (!Array.isArray(s.fame) || !s.fame.every(validFame)) return null;
  return {
    v: SNAPSHOT_VERSION,
    savedAt: s.savedAt,
    season: {
      number: season.number,
      startedAt: season.startedAt,
      layerEnteredAt: entered as (number | null)[],
    },
    total: s.total,
    countries: { ...(countries as Record<string, number>) },
    days: (s.days as [number, number][]).map((d) => [d[0], d[1]] as [number, number]),
    fame: (s.fame as FameEntry[]).slice(-MAX_FAME_ENTRIES),
  };
}

/**
 * Choose what to restore from the primary and backup snapshot texts. Never silently falls back to
 * an empty hole: if a snapshot existed but neither copy is valid, the caller must decide (and log).
 */
export function chooseSnapshot(
  primary: string | null,
  backup: string | null,
): { snapshot: Snapshot | null; source: "primary" | "backup" | "none" | "corrupt" } {
  const parse = (text: string | null): Snapshot | null => {
    if (text === null) return null;
    try {
      return validateSnapshot(JSON.parse(text));
    } catch {
      return null;
    }
  };
  const p = parse(primary);
  if (p) return { snapshot: p, source: "primary" };
  const b = parse(backup);
  if (b) return { snapshot: b, source: "backup" };
  if (primary === null && backup === null) return { snapshot: null, source: "none" };
  return { snapshot: null, source: "corrupt" };
}
