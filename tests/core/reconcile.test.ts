import { describe, expect, it } from "vitest";
import { Reconciler } from "../../src/core/reconcile";

describe("Reconciler", () => {
  it("shows your own scoops at once (eased) on top of the server total", () => {
    const r = new Reconciler(100);
    r.reset(1000, 1);
    let shown = r.step(16, 5);
    expect(shown).toBeGreaterThan(1000);
    for (let i = 0; i < 100; i++) shown = r.step(16, 5);
    expect(shown).toBe(1005);
  });

  it("never goes backwards when the server drops scoops", () => {
    const r = new Reconciler(10);
    r.reset(100, 1);
    for (let i = 0; i < 50; i++) r.step(16, 10);
    expect(r.displayed).toBe(110);
    // Server accepted only 4 of the 10.
    r.setServer(104);
    for (let i = 0; i < 50; i++) r.step(16, 0);
    expect(r.displayed).toBe(110);
    r.setServer(120);
    for (let i = 0; i < 50; i++) r.step(16, 0);
    expect(r.displayed).toBe(120);
  });

  it("ignores an older (smaller) server total", () => {
    const r = new Reconciler();
    r.reset(500, 1);
    r.setServer(400);
    expect(r.serverTotal).toBe(500);
  });

  it("resets on a new season", () => {
    const r = new Reconciler();
    r.reset(13_000_000, 1);
    expect(r.setServer(3, 2)).toBe(true);
    expect(r.displayed).toBe(3);
    expect(r.seasonNumber).toBe(2);
  });

  it("handles zero or negative time steps", () => {
    const r = new Reconciler();
    r.reset(10, 1);
    expect(r.step(0, 5)).toBe(10);
    expect(r.step(-50, 5)).toBe(10);
  });
});
