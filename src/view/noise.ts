/** Seeded value noise and fractal noise for procedural textures. Pure, so it runs in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ValueNoise {
  private readonly perm: Uint8Array;
  private readonly values: Float32Array;

  constructor(seed: number) {
    const rand = mulberry32(seed);
    this.perm = new Uint8Array(512);
    this.values = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j]!, p[i]!];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    for (let i = 0; i < 256; i++) this.values[i] = rand();
  }

  private v(x: number, y: number): number {
    return this.values[this.perm[(this.perm[x & 255]! + y) & 511]!]!;
  }

  /** Smooth noise in 0..1, tileable every `period` units when given. */
  noise(x: number, y: number, period = 256): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const w = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = this.v(x0, y0);
    const b = this.v(x1, y0);
    const c = this.v(x0, y1);
    const d = this.v(x1, y1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }

  /** Fractal noise, 0..1. */
  fbm(x: number, y: number, octaves = 4, period = 256): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq, period * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Three-stop ramp over a palette (light, mid, dark). */
export function ramp(
  palette: readonly [string, string, string] | readonly string[],
  t: number,
): [number, number, number] {
  const [a, b, c] = [hexToRgb(palette[0]!), hexToRgb(palette[1]!), hexToRgb(palette[2]!)];
  return t < 0.5 ? lerpRgb(a, b, t * 2) : lerpRgb(b, c, (t - 0.5) * 2);
}
