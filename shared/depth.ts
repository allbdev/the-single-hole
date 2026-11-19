import { ARRIVAL_METERS, ARRIVAL_SCOOPS, LAYERS, type LayerData } from "./data/layers";

interface Knot {
  scoops: number;
  meters: number;
}

const KNOTS: readonly Knot[] = [
  ...LAYERS.map((l) => ({ scoops: l.startScoops, meters: l.startMeters })),
  { scoops: ARRIVAL_SCOOPS, meters: ARRIVAL_METERS },
];

function clampScoops(scoops: number): number {
  if (!Number.isFinite(scoops) || scoops <= 0) return 0;
  return Math.min(scoops, ARRIVAL_SCOOPS);
}

/** World depth in meters for a scoop count. Piecewise linear between the layer knots. */
export function scoopsToMeters(scoops: number): number {
  const s = clampScoops(scoops);
  for (let i = KNOTS.length - 2; i >= 0; i--) {
    const a = KNOTS[i]!;
    if (s >= a.scoops) {
      const b = KNOTS[i + 1]!;
      return a.meters + ((s - a.scoops) / (b.scoops - a.scoops)) * (b.meters - a.meters);
    }
  }
  return 0;
}

/** Inverse of `scoopsToMeters` (fractional scoops). */
export function metersToScoops(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  const m = Math.min(meters, ARRIVAL_METERS);
  for (let i = KNOTS.length - 2; i >= 0; i--) {
    const a = KNOTS[i]!;
    if (m >= a.meters) {
      const b = KNOTS[i + 1]!;
      return a.scoops + ((m - a.meters) / (b.meters - a.meters)) * (b.scoops - a.scoops);
    }
  }
  return 0;
}

/** Index of the layer the bottom of the hole is in. */
export function layerIndexAtScoops(scoops: number): number {
  const s = clampScoops(scoops);
  for (let i = LAYERS.length - 1; i >= 0; i--) {
    if (s >= LAYERS[i]!.startScoops) return i;
  }
  return 0;
}

export function layerAtScoops(scoops: number): LayerData {
  return LAYERS[layerIndexAtScoops(scoops)]!;
}

/** Meters until the next layer starts, or null in the last layer. */
export function metersToNextLayer(scoops: number): number | null {
  const next = LAYERS[layerIndexAtScoops(scoops) + 1];
  return next ? next.startMeters - scoopsToMeters(scoops) : null;
}

/** Fraction of the way to Japan, 0..1, by distance. */
export function progressToJapan(scoops: number): number {
  return scoopsToMeters(scoops) / ARRIVAL_METERS;
}

/** Meters dug by `n` scoops starting at `from` scoops. */
export function metersForScoops(from: number, n: number): number {
  return scoopsToMeters(from + n) - scoopsToMeters(from);
}

export function hasArrived(scoops: number): boolean {
  return scoops >= ARRIVAL_SCOOPS;
}
