import { describe, expect, it } from "vitest";
import {
  countryName,
  etaYear,
  formatAgo,
  formatClock,
  formatCount,
  formatDepth,
  formatDistance,
  formatDuration,
  formatPercent,
  formatSince,
  holeHour,
  splitDepth,
} from "../../src/core/format";

const DAY = 86_400_000;

describe("format", () => {
  it("formats counts per locale", () => {
    expect(formatCount(9_381_220, "pt-BR")).toBe("9.381.220");
    expect(formatCount(9_381_220, "en")).toBe("9,381,220");
    expect(formatCount(Number.NaN, "en")).toBe("0");
  });

  it("formats depth like the canvas", () => {
    expect(formatDepth(8919.4002, "pt-BR")).toBe("8.919,4 m");
    expect(formatDepth(8919.4002, "en")).toBe("8,919.4 m");
    expect(formatDepth(7000, "pt-BR")).toBe("7.000,0 m");
    expect(formatDepth(2_900_000, "pt-BR")).toBe("2.900 km");
    expect(formatDepth(-3, "en")).toBe("0.000 m");
    expect(formatDepth(0.0012, "pt-BR")).toBe("0,001 m");
    expect(formatDepth(42.256, "pt-BR")).toBe("42,25 m");
    expect(splitDepth(8919.4, "pt-BR")).toEqual({ value: "8.919,4", unit: "m" });
  });

  it("formats distances", () => {
    expect(formatDistance(1081, "pt-BR")).toBe("1.081 m");
    expect(formatDistance(8_900, "pt-BR")).toBe("8.900 m");
    expect(formatDistance(12_400, "pt-BR")).toBe("12,4 km");
    expect(formatDistance(12_733_000, "pt-BR")).toBe("12.733 km");
  });

  it("formats percents like the share card (0,07%)", () => {
    expect(formatPercent(0.0007, "pt-BR")).toBe("0,07%");
    expect(formatPercent(0.0007, "en")).toBe("0.07%");
    expect(formatPercent(0.125, "pt-BR")).toBe("12%");
    expect(formatPercent(0.05, "en")).toBe("5.0%");
    expect(formatPercent(2, "en")).toBe("100%");
  });

  it("formats durations with at most two units (the arrival board: 5 anos, 41 dias)", () => {
    expect(formatDuration(5 * 365 * DAY + 41 * DAY, "pt-BR")).toBe("5 anos, 41 dias");
    expect(formatDuration(6 * DAY + 3_600_000, "pt-BR")).toBe("6 dias");
    expect(formatDuration(1 * DAY, "en")).toBe("1 day");
    expect(formatDuration(4 * 60_000, "pt-BR")).toBe("4 min");
    expect(formatDuration(12_000, "pt-BR")).toBe("12 s");
    expect(formatDuration(3 * 3_600_000, "en")).toBe("3 h");
    expect(formatDuration(365 * DAY, "en")).toBe("1 year");
  });

  it("formats feed ages", () => {
    expect(formatAgo(12_000, "pt-BR")).toBe("12 s");
    expect(formatAgo(3 * 60_000, "pt-BR")).toBe("3 min");
    expect(formatAgo(2 * 3_600_000, "en")).toBe("2 h");
    expect(formatAgo(3 * DAY, "en")).toBe("3 days");
  });

  it("uses Brasília time for clocks", () => {
    const t = Date.UTC(2026, 10, 19, 7, 12); // 04:12 in Brasília (UTC-3)
    expect(formatClock(t, "pt-BR")).toBe("04:12");
    expect(holeHour(t)).toBeCloseTo(4.2, 5);
  });

  it("formats 'since' within a week and beyond", () => {
    const tuesday = Date.UTC(2026, 10, 17, 17, 2); // Tue 14:02 in Brasília
    expect(formatSince(tuesday, tuesday + DAY, "pt-BR")).toBe("terça, 14h02");
    expect(formatSince(tuesday, tuesday + DAY, "en")).toBe("Tuesday, 14:02");
    expect(formatSince(tuesday, tuesday + 30 * DAY, "pt-BR")).toMatch(/17 de nov\.?, 14h02/);
  });

  it("names countries, never cities, with an unknown fallback", () => {
    expect(countryName("BR", "pt-BR")).toBe("Brasil");
    expect(countryName("JP", "en")).toBe("Japan");
    expect(countryName("XX", "pt-BR")).toBe("Algum lugar");
    expect(countryName("nope", "en")).toBe("Somewhere");
  });

  it("estimates the arrival year at this week's pace", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(etaYear(365 * 1000, { scoops: 7000, spanMs: 7 * DAY }, now)).toBe(2027);
    expect(etaYear(100, { scoops: 0, spanMs: 7 * DAY }, now)).toBeNull();
  });
});
