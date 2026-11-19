import { scoopsToMeters } from "../../shared/depth";

/** Show "while you were away" only when you were gone this long and the world moved this much. */
export const AWAY_MIN_MS = 10 * 60_000;
export const AWAY_MIN_METERS = 0.1;

export interface LastSeen {
  total: number;
  season: number;
  at: number;
}

/**
 * Meters the world dug since your last visit, or null when there is nothing worth saying. A new
 * season since then counts the old hole's remainder as unknown, so only the new season's depth is
 * reported.
 */
export function awayMeters(last: LastSeen | null, total: number, season: number, now: number): number | null {
  if (!last || now - last.at < AWAY_MIN_MS) return null;
  const meters =
    season === last.season ? scoopsToMeters(total) - scoopsToMeters(last.total) : scoopsToMeters(total);
  return meters >= AWAY_MIN_METERS ? meters : null;
}
