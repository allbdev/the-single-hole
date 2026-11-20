import centroids from "./country-centroids.json";
import regions from "./region-centroids.json";

/** The hole: inland São Paulo state ("O BURACO · INTERIOR DE SP"). */
export const HOLE_LAT_LON: [number, number] = [-22.3, -48.6];

/** Country centroid [lat, lon] or null. */
export function countryLatLon(code: string): [number, number] | null {
  const c = (centroids as unknown as Record<string, [number, number]>)[code];
  return c ?? null;
}

/** A state or region's point ("BR", "ES" → Espírito Santo), or null when we don't have it. */
export function regionLatLon(country: string, region: string): [number, number] | null {
  if (!region) return null;
  const r = (regions as unknown as Record<string, [number, number]>)[`${country}-${region}`];
  return r ?? null;
}

/** Unit-sphere position for a lat/lon, with lon 0 facing +Z and north up (+Y). */
export function latLonToVector(lat: number, lon: number, radius = 1): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  return [
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  ];
}

/** Equirectangular projection to a canvas of size w × h. */
export function project(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

/**
 * Unwrap a ring's longitudes so consecutive points never jump more than 180°, which keeps rings
 * that cross the antimeridian (Russia, Fiji) drawable; the caller draws them at ±360° too.
 */
export function unwrapRing(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let offset = 0;
  let prev: number | null = null;
  for (const [lon, lat] of ring) {
    if (prev !== null) {
      const d = lon + offset - prev;
      if (d > 180) offset -= 360;
      else if (d < -180) offset += 360;
    }
    const l = lon + offset;
    out.push([l, lat]);
    prev = l;
  }
  return out;
}

/** Dot radius for a country with `players` online (log scale, never zero). */
export function dotRadius(players: number): number {
  return 0.012 + Math.log10(1 + Math.max(0, players)) * 0.012;
}
