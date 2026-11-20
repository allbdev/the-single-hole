import { describe, expect, it } from "vitest";
import {
  DIG_SECONDS,
  FLICK_AT,
  LOAD_FROM,
  REST_PITCH,
  digPose,
  hoverOffset,
  retrigger,
} from "../../src/view/dig-motion";

describe("dig motion", () => {
  it("rests when not digging", () => {
    for (const t of [0, 1, -1, 2, Number.NaN]) {
      expect(digPose(t)).toEqual({ inward: 0, lift: 0, pitch: REST_PITCH, roll: 0, loaded: false });
    }
  });

  it("reaches into the hole, scoops, lifts out and flicks", () => {
    const reach = digPose(0.28);
    expect(reach.inward).toBeGreaterThan(0.3);
    expect(reach.lift).toBeLessThan(-0.5);
    expect(reach.pitch).toBeLessThan(REST_PITCH); // nose down into the dirt
    const scoop = digPose(0.42);
    expect(scoop.pitch).toBeGreaterThan(reach.pitch); // bowl comes up level
    const lifted = digPose(0.66);
    expect(lifted.lift).toBeGreaterThan(0);
    expect(Math.abs(digPose(0.8).roll)).toBeGreaterThan(0.3); // the flick
  });

  it("carries dirt only between the scoop and the flick", () => {
    expect(digPose(LOAD_FROM - 0.01).loaded).toBe(false);
    expect(digPose(LOAD_FROM + 0.01).loaded).toBe(true);
    expect(digPose(FLICK_AT - 0.01).loaded).toBe(true);
    expect(digPose(FLICK_AT + 0.01).loaded).toBe(false);
  });

  it("moves continuously (no jumps between keyframes)", () => {
    let prev = digPose(0.001);
    for (let t = 0.002; t < 1; t += 0.001) {
      const p = digPose(t);
      expect(Math.abs(p.lift - prev.lift)).toBeLessThan(0.02);
      expect(Math.abs(p.pitch - prev.pitch)).toBeLessThan(0.03);
      prev = p;
    }
  });

  it("restarts a dig only after the flick, so fast clicking stays smooth", () => {
    expect(retrigger(0)).toBeGreaterThan(0);
    expect(retrigger(0.3)).toBe(0.3);
    expect(retrigger(0.9)).toBeLessThan(0.01);
    expect(DIG_SECONDS.you).toBeLessThan(DIG_SECONDS.others);
  });

  it("hovers gently and differently per spoon", () => {
    const a = hoverOffset(3, 0);
    const b = hoverOffset(3, 1.7);
    expect(Math.abs(a.lift)).toBeLessThan(0.06);
    expect(a.lift).not.toBe(b.lift);
  });
});
