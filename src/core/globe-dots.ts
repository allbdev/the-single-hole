import type { CountryStat } from "../../shared/protocol";

export interface GlobeDot {
  lat: number;
  lon: number;
  players: number;
}

/** Where a country, or a region within it, sits on the globe; null when unknown. */
export interface Places {
  country(code: string): [number, number] | null;
  region(country: string, region: string): [number, number] | null;
}

/**
 * The globe's dots: one per region the server reports (regions with enough players to hide in),
 * one at the country's point for everyone else in that country. Your own dot goes to your region
 * even when you're alone there: only you know it.
 */
export function globeDots(
  countries: readonly CountryStat[],
  places: Places,
  you: { country: string; region: string } | null = null,
  max = 400,
): GlobeDot[] {
  const dots: GlobeDot[] = [];
  for (const c of countries) {
    if (c.players <= 0) continue;
    const home = places.country(c.code);
    let rest = c.players;
    let yourDot: GlobeDot | null = null;
    for (const r of c.regions ?? []) {
      const at = places.region(c.code, r.code);
      if (!at) continue;
      const n = Math.min(r.players, rest);
      if (n <= 0) continue;
      const dot = { lat: at[0], lon: at[1], players: n };
      dots.push(dot);
      rest -= n;
      if (you && you.country === c.code && you.region === r.code) yourDot = dot;
    }
    // You're counted in the country's remainder when your region wasn't reported: move yourself.
    if (you && you.country === c.code && !yourDot && rest > 0) {
      const at = places.region(c.code, you.region);
      if (at) {
        dots.push({ lat: at[0], lon: at[1], players: 1 });
        rest -= 1;
      }
    }
    if (rest > 0 && home) dots.push({ lat: home[0], lon: home[1], players: rest });
  }
  return dots.slice(0, max);
}
