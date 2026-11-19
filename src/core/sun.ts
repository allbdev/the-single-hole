/**
 * Lighting for the real time of day at the hole (Brasília time). Pure: hour in, numbers out.
 * Night ("quiet hours", board 7) turns on the camping lantern.
 */
export interface Lighting {
  /** 0 at night, 1 at full day. */
  day: number;
  /** Sun elevation in radians (negative below the horizon). */
  elevation: number;
  /** Sun azimuth in radians, east (0) through north to west (π). */
  azimuth: number;
  sunIntensity: number;
  sunColor: string;
  skyColor: string;
  groundColor: string;
  hemiIntensity: number;
  /** The lantern is on at night. */
  lantern: boolean;
  lanternIntensity: number;
  exposure: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((v, i) =>
        Math.round(v + (pb[i]! - v) * clamp01(t))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function lightingAt(hour: number): Lighting {
  const h = ((hour % 24) + 24) % 24;
  // Sunrise ~6, sunset ~18 (São Paulo is close to the tropic; good enough for a picture).
  const elevation = Math.sin(((h - 6) / 12) * Math.PI) * (Math.PI / 2.4);
  const day = smooth(-0.12, 0.25, elevation);
  const golden = 1 - smooth(0.1, 0.6, Math.abs(elevation));
  const sunColor = mix("#fff4e2", "#ffb27a", golden * day);
  return {
    day,
    elevation,
    azimuth: ((h - 6) / 12) * Math.PI,
    sunIntensity: 2.2 * day,
    sunColor,
    skyColor: mix("#1a2338", "#a9c3df", day),
    groundColor: mix("#0b0d10", "#4a3b2a", day),
    hemiIntensity: 0.12 + 0.6 * day,
    lantern: day < 0.35,
    lanternIntensity: 6 * (1 - smooth(0.05, 0.35, day)),
    exposure: 0.85 + 0.25 * day,
  };
}
