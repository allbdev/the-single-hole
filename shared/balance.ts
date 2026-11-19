import { ARRIVAL_SCOOPS } from "./data/layers";

/** The arrival board's season length: "5 anos, 41 dias". */
export const SEASON_TARGET_MS = (5 * 365 + 41) * 86_400_000;

/**
 * The world's average pace that makes a season last the target. The knots in `data/layers.ts` are
 * tuned against the canvas numbers; this says how busy the world has to be, on average, for the
 * board's "5 anos, 41 dias" to come true.
 */
export const ASSUMED_SCOOPS_PER_SECOND = ARRIVAL_SCOOPS / (SEASON_TARGET_MS / 1000);

/** How long a season lasts at a given average pace (ms). */
export function seasonDurationMs(scoopsPerSecond: number): number {
  if (!(scoopsPerSecond > 0)) return Infinity;
  return (ARRIVAL_SCOOPS / scoopsPerSecond) * 1000;
}
