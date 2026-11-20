import { ARRIVAL_METERS, LAYERS } from "../../shared/data/layers";
import type { RimSpoon } from "../../shared/protocol";

/**
 * Slab heights for the cut block, from the Section board (in board pixels). Not to scale: "se
 * estivesse, o quintal teria um pixel".
 */
export const SECTION_SLABS: readonly number[] = [42, 59, 76, 75, 74, 68, 104, 70];
const SLAB_TOTAL = SECTION_SLABS.reduce((a, b) => a + b, 0);

/** Top of each slab as a fraction of the block height (0 = top, 1 = bottom). */
export function slabTops(): number[] {
  const tops: number[] = [];
  let acc = 0;
  for (const h of SECTION_SLABS) {
    tops.push(acc / SLAB_TOTAL);
    acc += h;
  }
  return tops;
}

/** Where the bottom of the hole sits in the block (0..1 from the top), interpolated inside its layer. */
export function sectionDepthFraction(meters: number): number {
  const m = Math.min(Math.max(0, meters), ARRIVAL_METERS);
  const tops = slabTops();
  for (let i = LAYERS.length - 1; i >= 0; i--) {
    const start = LAYERS[i]!.startMeters;
    if (m >= start) {
      const end = LAYERS[i + 1]?.startMeters ?? ARRIVAL_METERS;
      const f = (m - start) / (end - start);
      return tops[i]! + (SECTION_SLABS[i]! / SLAB_TOTAL) * f;
    }
  }
  return 0;
}

export interface RimSlot {
  id: string;
  angle: number;
  radius: number;
  /** Outward tilt (radians) and twist, stable per id. */
  tilt: number;
  twist: number;
  you: boolean;
}

/** Small stable hash of a string to 0..1. */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Your spoon's fixed place at the rim: front right, where the canvas puts "VOCÊ". */
export const YOU_ANGLE = -0.45;
/** Where the tape measure lies (front right, below you): kept clear of spoons. */
export const TAPE_ANGLE = -1.05;

/**
 * Place spoons around the rim. Each id keeps its place (by hash) so spoons don't jump when the list
 * changes; you always sit front right.
 */
export function rimSlots(rim: RimSpoon[], you: string | null, max = 16): RimSlot[] {
  const others = rim.filter((r) => r.id !== you).slice(0, max - 1);
  const slots: RimSlot[] = [];
  if (you) slots.push({ id: you, angle: YOU_ANGLE, radius: 1.75, tilt: 1.05, twist: 0.3, you: true });
  const used: number[] = [YOU_ANGLE, TAPE_ANGLE];
  for (const r of others) {
    let angle = hash01(r.id) * Math.PI * 2;
    // Nudge away from neighbours so tags don't pile up.
    for (let tries = 0; tries < 12 && used.some((a) => angularGap(a, angle) < 0.48); tries++) angle += 0.23;
    used.push(angle);
    slots.push({
      id: r.id,
      angle,
      radius: 1.8 + hash01(r.id + "r") * 0.45,
      tilt: 0.75 + hash01(r.id + "t") * 0.55,
      twist: hash01(r.id + "w") * Math.PI * 2,
      you: false,
    });
  }
  return slots;
}

export function angularGap(a: number, b: number): number {
  const d = Math.abs(((((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return d;
}
