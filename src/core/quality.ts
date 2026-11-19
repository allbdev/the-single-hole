/** Render quality presets. Phones get fewer grass blades, no shadows and a capped pixel ratio. */
export type QualityName = "low" | "medium" | "high";

export interface Quality {
  name: QualityName;
  grassBlades: number;
  clods: number;
  maxPixelRatio: number;
  shadows: boolean;
  antialias: boolean;
  textureSize: number;
  /** Photo-style depth of field (tilt-shift) on the hole view. */
  depthOfField: boolean;
}

export const QUALITY: Record<QualityName, Quality> = {
  low: {
    name: "low",
    grassBlades: 9_000,
    clods: 160,
    maxPixelRatio: 1.5,
    shadows: false,
    antialias: false,
    textureSize: 1024,
    depthOfField: false,
  },
  medium: {
    name: "medium",
    grassBlades: 24_000,
    clods: 320,
    maxPixelRatio: 2,
    shadows: false,
    antialias: true,
    textureSize: 1024,
    depthOfField: false,
  },
  high: {
    name: "high",
    grassBlades: 60_000,
    clods: 520,
    maxPixelRatio: 2,
    shadows: true,
    antialias: true,
    textureSize: 2048,
    depthOfField: true,
  },
};

export interface DeviceInfo {
  coarsePointer: boolean;
  screenWidth: number;
  cores: number;
  /** navigator.deviceMemory in GB when available. */
  memoryGb: number | null;
}

/** Pick a preset; `?quality=low|medium|high` overrides for testing. */
export function pickQuality(device: DeviceInfo, search = ""): Quality {
  const forced = new URLSearchParams(search).get("quality");
  if (forced === "low" || forced === "medium" || forced === "high") return QUALITY[forced];
  const phone = device.coarsePointer && device.screenWidth < 900;
  const weak = device.cores <= 4 || (device.memoryGb !== null && device.memoryGb <= 3);
  if (phone) return weak ? QUALITY.low : QUALITY.medium;
  return weak ? QUALITY.medium : QUALITY.high;
}
