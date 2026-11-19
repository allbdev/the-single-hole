import { describe, expect, it } from "vitest";
import { ARRIVAL_METERS, ARRIVAL_SCOOPS, LAYERS } from "../../shared/data/layers";
import {
  hasArrived,
  layerAtScoops,
  layerIndexAtScoops,
  metersForScoops,
  metersToNextLayer,
  metersToScoops,
  progressToJapan,
  scoopsToMeters,
} from "../../shared/depth";

describe("depth math", () => {
  it("matches the canvas: 9.381.220 scoops reach 8.919,4 m", () => {
    expect(Math.floor(scoopsToMeters(9_381_220) * 10) / 10).toBe(8919.4);
  });

  it("matches the canvas: the arrival total reaches Japan at 12.742 km", () => {
    expect(scoopsToMeters(ARRIVAL_SCOOPS)).toBe(ARRIVAL_METERS);
    expect(hasArrived(ARRIVAL_SCOOPS)).toBe(true);
    expect(hasArrived(ARRIVAL_SCOOPS - 1)).toBe(false);
  });

  it("matches the canvas share card: 8,9 km is 0,07% of the way", () => {
    expect(progressToJapan(9_381_220) * 100).toBeCloseTo(0.07, 2);
  });

  it("puts each layer start exactly at its depth", () => {
    for (const layer of LAYERS) {
      expect(scoopsToMeters(layer.startScoops)).toBeCloseTo(layer.startMeters, 6);
    }
  });

  it("is monotonic and meters per scoop never shrink with depth", () => {
    let prev = -1;
    let prevRate = 0;
    for (let i = 0; i < LAYERS.length; i++) {
      const a = LAYERS[i]!;
      const b = LAYERS[i + 1] ?? { startScoops: ARRIVAL_SCOOPS, startMeters: ARRIVAL_METERS };
      const rate = (b.startMeters - a.startMeters) / (b.startScoops - a.startScoops);
      expect(rate).toBeGreaterThanOrEqual(prevRate);
      prevRate = rate;
      expect(scoopsToMeters(a.startScoops)).toBeGreaterThan(prev);
      prev = scoopsToMeters(a.startScoops);
    }
  });

  it("clamps bad input", () => {
    expect(scoopsToMeters(-5)).toBe(0);
    expect(scoopsToMeters(Number.NaN)).toBe(0);
    expect(scoopsToMeters(Number.POSITIVE_INFINITY)).toBe(0);
    expect(scoopsToMeters(ARRIVAL_SCOOPS * 2)).toBe(ARRIVAL_METERS);
    expect(metersToScoops(-1)).toBe(0);
    expect(metersToScoops(ARRIVAL_METERS * 3)).toBe(ARRIVAL_SCOOPS);
  });

  it("round-trips meters and scoops", () => {
    for (const s of [0, 1, 19_999, 20_000, 500_000, 9_381_220, 12_000_000, ARRIVAL_SCOOPS]) {
      expect(metersToScoops(scoopsToMeters(s))).toBeCloseTo(s, 3);
    }
  });

  it("finds the layer at a depth", () => {
    expect(layerAtScoops(0).id).toBe("backyard");
    expect(layerAtScoops(19_999).id).toBe("backyard");
    expect(layerAtScoops(20_000).id).toBe("worms");
    expect(layerAtScoops(9_381_220).id).toBe("preSalt");
    expect(layerIndexAtScoops(ARRIVAL_SCOOPS)).toBe(LAYERS.length - 1);
  });

  it("measures the distance to the next layer (the canvas: Lençol Freático in ~1.081 m)", () => {
    expect(Math.round(metersToNextLayer(9_381_220)!)).toBe(1081);
    expect(metersToNextLayer(ARRIVAL_SCOOPS - 1)).toBeNull();
  });

  it("measures meters for a run of scoops", () => {
    expect(metersForScoops(0, 10_000)).toBeCloseTo(1, 6);
  });
});
