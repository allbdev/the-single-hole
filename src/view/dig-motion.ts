/**
 * How a held spoon moves. Pure numbers: given time, where the spoon is relative to its resting
 * place. No arm or hand is drawn; the spoon just moves like someone is holding it.
 *
 * The rig pivots at the bowl: `inward` moves the bowl toward the hole center, `lift` up from its
 * hover height; `pitch` tilts the spoon around the bowl (more negative = handle higher, bowl
 * nose-down into the dirt), `roll` twists it around the handle.
 */
export interface SpoonPose {
  inward: number;
  lift: number;
  pitch: number;
  roll: number;
  /** A clump of dirt sits in the bowl. */
  loaded: boolean;
}

/** Resting pitch: handle up behind, bowl level and facing up, like held ready to dig. */
export const REST_PITCH = -0.42;

const REST: SpoonPose = { inward: 0, lift: 0, pitch: REST_PITCH, roll: 0, loaded: false };

interface Key {
  t: number;
  pose: Omit<SpoonPose, "loaded">;
}

/**
 * One scoop, as fractions of the dig: reach in and down, dig the bowl into the lip, scoop up,
 * lift out, flick the dirt onto the mound, settle back.
 */
const KEYS: readonly Key[] = [
  { t: 0, pose: { inward: 0, lift: 0, pitch: REST_PITCH, roll: 0 } },
  { t: 0.28, pose: { inward: 0.42, lift: -0.72, pitch: -0.85, roll: 0.05 } }, // bowl into the lip
  { t: 0.42, pose: { inward: 0.46, lift: -0.6, pitch: -0.12, roll: 0 } }, // scoop: bowl comes up
  { t: 0.66, pose: { inward: 0.1, lift: 0.16, pitch: -0.3, roll: -0.05 } }, // lift out
  { t: 0.8, pose: { inward: -0.08, lift: 0.22, pitch: -0.78, roll: 0.55 } }, // flick
  { t: 1, pose: { inward: 0, lift: 0, pitch: REST_PITCH, roll: 0 } },
];

/** The bowl holds dirt between the scoop and the flick. */
export const LOAD_FROM = 0.4;
export const FLICK_AT = 0.78;

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Pose at progress `t` (0..1) of one dig. Outside 0..1 the spoon is at rest. */
export function digPose(t: number): SpoonPose {
  if (!(t > 0 && t < 1)) return { ...REST };
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1]!.t) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const k = smooth((t - a.t) / (b.t - a.t));
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    inward: mix(a.pose.inward, b.pose.inward),
    lift: mix(a.pose.lift, b.pose.lift),
    pitch: mix(a.pose.pitch, b.pose.pitch),
    roll: mix(a.pose.roll, b.pose.roll),
    loaded: t >= LOAD_FROM && t < FLICK_AT,
  };
}

/** Idle hover: a slow bob and sway, different for each spoon by `phase`. */
export function hoverOffset(time: number, phase: number): { lift: number; yaw: number; pitch: number } {
  return {
    lift: Math.sin(time * 1.3 + phase) * 0.035 + Math.sin(time * 0.71 + phase * 2) * 0.015,
    yaw: Math.sin(time * 0.5 + phase * 3) * 0.06,
    pitch: Math.sin(time * 0.9 + phase) * 0.04,
  };
}

/**
 * Advance a dig. A new dig while one is running restarts it from the reach if the bowl has
 * already left the dirt; otherwise the running dig continues (fast clicking still looks smooth).
 */
export function retrigger(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0.0001;
  return progress > FLICK_AT ? 0.0001 : progress;
}

/** Seconds per dig: your own spoon is quicker, so fast clicking keeps up. */
export const DIG_SECONDS = { you: 0.6, others: 0.95 } as const;
