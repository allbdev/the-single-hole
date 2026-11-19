import { describe, expect, it } from "vitest";
import { ASSUMED_SCOOPS_PER_SECOND, SEASON_TARGET_MS, seasonDurationMs } from "../../shared/balance";
import { ARRIVAL_SCOOPS, LAYERS } from "../../shared/data/layers";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("balance", () => {
  it("lasts the arrival board's 5 anos, 41 dias at the assumed pace", () => {
    expect(Math.abs(seasonDurationMs(ASSUMED_SCOOPS_PER_SECOND) - SEASON_TARGET_MS)).toBeLessThan(DAY);
  });

  it("gives every layer at least a few days at that pace, so none flashes by", () => {
    for (let i = 0; i < LAYERS.length; i++) {
      const scoops = (LAYERS[i + 1]?.startScoops ?? ARRIVAL_SCOOPS) - LAYERS[i]!.startScoops;
      expect((scoops / ASSUMED_SCOOPS_PER_SECOND) * 1000, LAYERS[i]!.id).toBeGreaterThan(2 * DAY);
    }
  });

  it("records what a busy world does to the season (see TODO_FOR_YOU.md)", () => {
    // 1,000 players digging 3 scoops a second non-stop would finish a season in about an hour.
    expect(seasonDurationMs(3_000)).toBeLessThan(2 * HOUR);
    expect(seasonDurationMs(0)).toBe(Infinity);
  });
});
