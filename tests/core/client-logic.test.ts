import { describe, expect, it } from "vitest";
import { ARRIVAL_SCOOPS, LAYERS } from "../../shared/data/layers";
import type { ActivityFrame, ServerMessage } from "../../shared/protocol";
import { AWAY_MIN_MS, awayMeters } from "../../src/core/away";
import { applyServerMessage, initialWorld, layerDuration, topCountries } from "../../src/core/game-state";
import {
  SECTION_SLABS,
  YOU_ANGLE,
  angularGap,
  hash01,
  rimSlots,
  sectionDepthFraction,
  slabTops,
} from "../../src/core/layout";
import { QUALITY, pickQuality } from "../../src/core/quality";
import { ghostsBetween, replayDuration, replaySchedule, shouldOfferReplay } from "../../src/core/replay";
import { shareCardText } from "../../src/core/share-text";
import { lightingAt } from "../../src/core/sun";

const welcome = (over: Partial<Extract<ServerMessage, { t: "welcome" }>> = {}): ServerMessage => ({
  t: "welcome",
  v: 1,
  you: "me",
  now: 1000,
  season: { number: 1, startedAt: 0, layerEnteredAt: LAYERS.map((_, i) => (i === 0 ? 0 : null)) },
  total: 50,
  players: 3,
  rim: [],
  countries: [],
  feed: [],
  week: { scoops: 0, spanMs: 60_000 },
  fame: [],
  ...over,
});

describe("game state", () => {
  it("takes the welcome and tracks the clock offset", () => {
    const { state, events } = applyServerMessage(initialWorld(0), welcome(), 400);
    expect(state).toMatchObject({ connected: true, you: "me", total: 50, players: 3, clockOffset: 600 });
    expect(events).toEqual([{ kind: "welcome", firstTime: true }]);
    expect(applyServerMessage(state, welcome(), 0).events).toEqual([{ kind: "welcome", firstTime: false }]);
  });

  it("emits a layer event only for newly entered layers in the same season", () => {
    const s0 = applyServerMessage(initialWorld(0), welcome(), 0).state;
    const entered = [...s0.season.layerEnteredAt];
    entered[1] = 5000;
    const { state, events } = applyServerMessage(
      s0,
      { t: "layer", season: { ...s0.season, layerEnteredAt: entered } },
      0,
    );
    expect(events).toEqual([{ kind: "layer", layer: 1 }]);
    expect(applyServerMessage(state, { t: "layer", season: state.season }, 0).events).toEqual([]);
  });

  it("dedupes feed items and keeps the last eight", () => {
    let s = applyServerMessage(initialWorld(0), welcome(), 0).state;
    for (let i = 0; i < 12; i++) {
      s = applyServerMessage(s, { t: "feed", item: { id: i, at: i, kind: "find", find: "bone" } }, 0).state;
    }
    const again = applyServerMessage(
      s,
      { t: "feed", item: { id: 11, at: 11, kind: "find", find: "bone" } },
      0,
    );
    expect(again.events).toEqual([]);
    expect(s.feed).toHaveLength(8);
    expect(s.feed[0]!.id).toBe(4);
  });

  it("resets on a season end and puts the entry first in the hall of fame", () => {
    const s0 = applyServerMessage(initialWorld(0), welcome({ total: ARRIVAL_SCOOPS - 1 }), 0).state;
    const entry = {
      season: 1,
      startedAt: 0,
      endedAt: 99,
      scoops: ARRIVAL_SCOOPS,
      topCountries: [],
      onlineAtArrival: 3,
    };
    const next = { number: 2, startedAt: 99, layerEnteredAt: LAYERS.map((_, i) => (i === 0 ? 99 : null)) };
    const { state, events } = applyServerMessage(s0, { t: "seasonEnd", entry, next }, 0);
    expect(state.total).toBe(0);
    expect(state.season.number).toBe(2);
    expect(state.fame[0]).toEqual(entry);
    expect(events).toEqual([{ kind: "seasonEnd", entry }]);
  });

  it("passes acks and errors on as events and ignores activity", () => {
    const s = initialWorld(0);
    expect(applyServerMessage(s, { t: "ack", seq: 3, accepted: 2 }, 0).events).toEqual([
      { kind: "ack", seq: 3, accepted: 2 },
    ]);
    expect(applyServerMessage(s, { t: "error", code: "full" }, 0).events).toEqual([
      { kind: "error", code: "full" },
    ]);
    expect(applyServerMessage(s, { t: "activity", frames: [] }, 0).state).toBe(s);
  });

  it("tracks your place in the line until the welcome lets you in", () => {
    const s0 = initialWorld(0);
    const queued = applyServerMessage(s0, { t: "line", position: 312 }, 0);
    expect(queued.state.line).toBe(312);
    expect(queued.events).toEqual([{ kind: "line", position: 312 }]);
    const moved = applyServerMessage(queued.state, { t: "line", position: 1 }, 0).state;
    expect(moved.line).toBe(1);
    const welcome: ServerMessage = {
      t: "welcome",
      v: 1,
      you: "me",
      now: 0,
      season: s0.season,
      total: 10,
      players: 10_000,
      rim: [],
      countries: [],
      feed: [],
      week: { scoops: 0, spanMs: 60_000 },
      fame: [],
    };
    expect(applyServerMessage(moved, welcome, 0).state.line).toBeNull();
  });

  it("measures how long a layer took", () => {
    const season = { number: 1, startedAt: 0, layerEnteredAt: [0, 600, null, null, null, null, null, null] };
    expect(layerDuration(season, 1)).toBe(600);
    expect(layerDuration(season, 2)).toBeNull();
    expect(layerDuration(season, 0)).toBeNull();
  });

  it("builds the 'Quem está cavando' list with 'Outros N países'", () => {
    const list = topCountries(
      [
        { code: "BR", players: 812, scoops: 1 },
        { code: "PT", players: 96, scoops: 1 },
        { code: "AR", players: 71, scoops: 1 },
        { code: "US", players: 64, scoops: 1 },
        { code: "JP", players: 58, scoops: 1 },
        { code: "CL", players: 100, scoops: 9 },
        { code: "MX", players: 0, scoops: 99 },
        { code: "CO", players: 9, scoops: 1 },
      ],
      5,
    );
    expect(list.top.map((c) => c.code)).toEqual(["BR", "CL", "PT", "AR", "US"]);
    expect(list.others).toEqual({ count: 2, players: 67 });
  });
});

describe("replay", () => {
  const frames: ActivityFrame[] = [
    { at: 10_000, scoops: 10, countries: { BR: 8, JP: 2 } },
    { at: 11_000, scoops: 0, countries: {} },
    { at: 13_000, scoops: 1, countries: { PT: 1 } },
  ];

  it("schedules ghost digs at real speed, capped per second", () => {
    const s = replaySchedule(frames, 4);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s[0]!.at).toBe(0);
    expect(s.at(-1)).toMatchObject({ country: "PT", at: 3000 });
    expect(new Set(s.map((g) => g.country))).toEqual(new Set(["BR", "JP", "PT"]));
    expect(replayDuration(frames)).toBe(4000);
  });

  it("handles nothing to replay", () => {
    expect(replaySchedule([])).toEqual([]);
    expect(replayDuration([])).toBe(0);
  });

  it("finds ghosts in a time window and offers the replay only when quiet", () => {
    const s = replaySchedule(frames, 4);
    expect(ghostsBetween(s, 2000, 5000).every((g) => g.country === "PT")).toBe(true);
    expect(shouldOfferReplay(3, 10)).toBe(true);
    expect(shouldOfferReplay(30, 10)).toBe(false);
    expect(shouldOfferReplay(1, 0)).toBe(false);
  });
});

describe("while you were away", () => {
  const now = 10 * AWAY_MIN_MS;
  it("reports meters dug since the last visit", () => {
    expect(awayMeters({ total: 0, season: 1, at: 0 }, 2_000_000, 1, now)).toBeCloseTo(
      150 + 1240000 * (850 / 2125000),
      0,
    );
  });
  it("says nothing for short absences, tiny changes or first visits", () => {
    expect(awayMeters(null, 5_000_000, 1, now)).toBeNull();
    expect(awayMeters({ total: 0, season: 1, at: now - 1000 }, 5_000_000, 1, now)).toBeNull();
    expect(awayMeters({ total: 10, season: 1, at: 0 }, 20, 1, now)).toBeNull();
  });
  it("counts only the new hole after a season change", () => {
    expect(awayMeters({ total: 13_000_000, season: 1, at: 0 }, 760_000, 2, now)).toBeCloseTo(150, 3);
  });
});

describe("layout", () => {
  it("uses the Section board's slab proportions", () => {
    expect(SECTION_SLABS).toHaveLength(LAYERS.length);
    const tops = slabTops();
    expect(tops[0]).toBe(0);
    expect(tops.every((t, i) => i === 0 || t > tops[i - 1]!)).toBe(true);
    expect(sectionDepthFraction(0)).toBe(0);
    expect(sectionDepthFraction(12_742_000)).toBeCloseTo(1, 6);
    expect(sectionDepthFraction(7000)).toBeCloseTo(tops[4]!, 6);
    expect(sectionDepthFraction(8500)).toBeGreaterThan(tops[4]!);
    expect(sectionDepthFraction(8500)).toBeLessThan(tops[5]!);
  });

  it("keeps you front right and others in stable, separated places", () => {
    const rim = ["a", "b", "c", "d", "me"].map((id) => ({
      id,
      country: "BR",
      spoon: "teaspoon" as const,
      scoops: 1,
    }));
    const slots = rimSlots(rim, "me");
    expect(slots[0]).toMatchObject({ id: "me", you: true, angle: YOU_ANGLE });
    expect(slots).toHaveLength(5);
    const again = rimSlots([...rim].reverse(), "me");
    expect(again.find((s) => s.id === "c")!.angle).toBe(slots.find((s) => s.id === "c")!.angle);
    expect(rimSlots(rim, null, 3)).toHaveLength(2);
  });

  it("hashes stably and measures angular gaps", () => {
    expect(hash01("BR")).toBe(hash01("BR"));
    expect(hash01("BR")).not.toBe(hash01("JP"));
    expect(angularGap(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 6);
    expect(angularGap(0, Math.PI)).toBeCloseTo(Math.PI, 6);
  });
});

describe("quality", () => {
  it("gives phones fewer blades and no shadows; a URL flag overrides", () => {
    const phone = pickQuality({ coarsePointer: true, screenWidth: 390, cores: 6, memoryGb: 4 });
    const weakPhone = pickQuality({ coarsePointer: true, screenWidth: 390, cores: 4, memoryGb: 2 });
    const desktop = pickQuality({ coarsePointer: false, screenWidth: 1920, cores: 10, memoryGb: null });
    expect(phone.name).toBe("medium");
    expect(weakPhone.name).toBe("low");
    expect(desktop.name).toBe("high");
    expect(QUALITY.low.shadows).toBe(false);
    expect(QUALITY.low.grassBlades).toBeLessThan(QUALITY.high.grassBlades);
    expect(
      pickQuality({ coarsePointer: false, screenWidth: 1920, cores: 10, memoryGb: null }, "?quality=low")
        .name,
    ).toBe("low");
  });
});

describe("lighting", () => {
  it("is day at noon and night at 4 am with the lantern on", () => {
    const noon = lightingAt(12);
    const night = lightingAt(4.2);
    expect(noon.day).toBe(1);
    expect(noon.lantern).toBe(false);
    expect(night.day).toBe(0);
    expect(night.lantern).toBe(true);
    expect(night.lanternIntensity).toBeGreaterThan(0);
    expect(lightingAt(-20).day).toBe(lightingAt(4).day);
    expect(noon.sunColor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("share card text", () => {
  it("prints only the numbers, like board 6", () => {
    const t = shareCardText("pt-BR", 412, 9_381_220, "https://example.org/");
    expect(t.mine).toBe("412");
    expect(t.ofWorld).toBe("das 9.381.220 colheradas do mundo");
    expect(t.progress).toBe("Estamos a 0,07% do Japão. Falta você.");
    expect(t.domain).toBe("example.org");
    expect(t.plain).toContain("https://example.org/");
  });
});
