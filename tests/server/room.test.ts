import { describe, expect, it } from "vitest";
import { ARRIVAL_SCOOPS, LAYERS } from "../../shared/data/layers";
import { LIMITS, PROTOCOL_VERSION, encode, type ServerMessage } from "../../shared/protocol";
import { ALL, Room, STREAK_COUNT, type Output } from "../../server/room";
import { emptySnapshot, validateSnapshot, type Snapshot } from "../../server/snapshot";

const hello = (scoops = 0) => encode({ t: "hello", v: PROTOCOL_VERSION, spoon: "wooden", scoops });
const dig = (seq: number, n: number) => encode({ t: "dig", seq, n });

function msgs(out: Output, target?: string): ServerMessage[] {
  return out.send.filter(([to]) => target === undefined || to === target).map(([, m]) => m);
}

function join(room: Room, id: string, now: number, opts: { ip?: string; country?: string } = {}): Output {
  room.connect(id, { ip: opts.ip ?? `ip-${id}`, country: opts.country ?? "BR" }, now);
  return room.message(id, hello(), now);
}

function newRoom(snapshot: Snapshot | null = null, now = 0) {
  return new Room(snapshot, now, { random: () => 0.99 });
}

describe("Room: joining", () => {
  it("welcomes after hello with the full state", () => {
    const room = newRoom();
    const out = join(room, "a", 0);
    const [welcome] = msgs(out, "a");
    expect(welcome).toMatchObject({ t: "welcome", you: "a", total: 0, players: 1 });
    expect(room.players).toBe(1);
  });

  it("rejects a wrong protocol version and closes", () => {
    const room = newRoom();
    room.connect("a", { ip: "1", country: "BR" }, 0);
    const out = room.message("a", encode({ t: "hello", v: 999, spoon: "teaspoon", scoops: 0 }), 0);
    expect(msgs(out, "a")).toEqual([{ t: "error", code: "version" }]);
    expect(out.close).toEqual(["a"]);
  });

  it("caps connections per IP and per room", () => {
    const room = new Room(null, 0, { maxConnections: 12 });
    for (let i = 0; i < LIMITS.connectionsPerIp; i++) room.connect(`c${i}`, { ip: "same", country: "BR" }, 0);
    const tooMany = room.connect("extra", { ip: "same", country: "BR" }, 0);
    expect(msgs(tooMany)).toEqual([{ t: "error", code: "tooManyFromIp" }]);
    room.connect("x1", { ip: "other1", country: "BR" }, 0);
    room.connect("x2", { ip: "other2", country: "BR" }, 0);
    const full = room.connect("x3", { ip: "other3", country: "BR" }, 0);
    expect(msgs(full)).toEqual([{ t: "error", code: "full" }]);
    expect(room.counters.rejectedConnections).toBe(2);
  });

  it("frees the IP slot on disconnect", () => {
    const room = newRoom();
    for (let i = 0; i < LIMITS.connectionsPerIp; i++) room.connect(`c${i}`, { ip: "same", country: "BR" }, 0);
    room.disconnect("c0");
    expect(room.connect("again", { ip: "same", country: "BR" }, 0).close).toEqual([]);
  });
});

describe("Room: digging", () => {
  it("adds accepted scoops and acks them", () => {
    const room = newRoom();
    join(room, "a", 0);
    const out = room.message("a", dig(0, 5), 100);
    expect(msgs(out, "a")).toContainEqual({ t: "ack", seq: 0, accepted: 5 });
    expect(room.totalScoops).toBe(5);
  });

  it("caps each connection at the rate limit", () => {
    const room = newRoom();
    join(room, "a", 0);
    const first = room.message("a", dig(0, 40), 0);
    expect(msgs(first, "a")).toContainEqual({ t: "ack", seq: 0, accepted: LIMITS.scoopBurst });
    const later = room.message("a", dig(1, 40), 1000);
    expect(msgs(later, "a")).toContainEqual({ t: "ack", seq: 1, accepted: LIMITS.scoopsPerSecond });
    expect(room.counters.dropped).toBe(80 - LIMITS.scoopBurst - LIMITS.scoopsPerSecond);
  });

  it("caps all connections from one IP together", () => {
    const room = newRoom();
    for (let i = 0; i < 5; i++) join(room, `c${i}`, 0, { ip: "home" });
    for (let i = 0; i < 5; i++) room.message(`c${i}`, dig(0, 15), 0);
    expect(room.totalScoops).toBe(LIMITS.ipScoopBurst);
  });

  it("strikes bad messages and closes after too many", () => {
    const room = newRoom();
    join(room, "a", 0);
    let closed: string[] = [];
    for (let i = 0; i < LIMITS.maxStrikes; i++) {
      closed = room.message("a", "{bad json", i * 1000).close;
    }
    expect(closed).toEqual(["a"]);
    expect(room.counters.closedForStrikes).toBe(1);
  });

  it("drops a flood of messages beyond the per-second limit", () => {
    const room = newRoom();
    join(room, "a", 0);
    for (let i = 0; i < 40; i++) room.message("a", dig(i, 1), 10);
    expect(room.counters.badMessages).toBeGreaterThan(0);
    expect(room.totalScoops).toBeLessThanOrEqual(LIMITS.messagesPerSecond);
  });

  it("ignores digs before hello", () => {
    const room = newRoom();
    room.connect("a", { ip: "1", country: "BR" }, 0);
    room.message("a", dig(0, 5), 0);
    expect(room.totalScoops).toBe(0);
    expect(room.counters.badMessages).toBe(1);
  });

  it("ignores messages from unknown connections and a second hello", () => {
    const room = newRoom();
    expect(room.message("ghost", dig(0, 1), 0).send).toEqual([]);
    join(room, "a", 0);
    room.message("a", hello(), 0);
    expect(room.counters.badMessages).toBe(1);
  });

  it("tracks per-country season totals", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "JP" });
    join(room, "b", 0, { country: "BR" });
    room.message("a", dig(0, 10), 0);
    room.message("b", dig(0, 4), 0);
    expect(room.countryStats()).toEqual([
      { code: "JP", players: 1, scoops: 10 },
      { code: "BR", players: 1, scoops: 4 },
    ]);
  });
});

describe("Room: broadcasts", () => {
  it("broadcasts state only when something changed, at most every stateMs", () => {
    const room = newRoom();
    join(room, "a", 0);
    expect(msgs(room.tick(0)).some((m) => m.t === "state")).toBe(true);
    expect(msgs(room.tick(10)).some((m) => m.t === "state")).toBe(false);
    room.message("a", dig(0, 1), 20);
    expect(msgs(room.tick(50)).some((m) => m.t === "state")).toBe(false);
    expect(msgs(room.tick(200)).find((m) => m.t === "state")).toMatchObject({ total: 1, players: 1 });
    expect(room.tick(10_000).send.filter(([, m]) => m.t === "state")).toEqual([]);
  });

  it("sends broadcasts to everyone", () => {
    const room = newRoom();
    join(room, "a", 0);
    expect(room.tick(0).send.every(([to]) => to === ALL)).toBe(true);
  });

  it("goes idle when there is nothing to send", () => {
    const room = newRoom();
    join(room, "a", 0);
    room.tick(0);
    room.tick(10_000);
    expect(room.idle).toBe(true);
  });

  it("lists the most recently active spoons on the rim", () => {
    const room = new Room(null, 0, { rimSize: 2 });
    join(room, "a", 0);
    join(room, "b", 0);
    join(room, "c", 0);
    room.message("c", dig(0, 1), 100);
    room.message("a", dig(0, 2), 200);
    expect(room.rim().map((r) => r.id)).toEqual(["a", "c"]);
    expect(room.rim()[0]).toMatchObject({ spoon: "wooden", country: "BR", scoops: 2 });
  });
});

describe("Room: feed", () => {
  it("announces a country joining (throttled)", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "CL" });
    room.message("a", dig(0, 1), 0);
    const feed = msgs(room.tick(0)).filter((m) => m.t === "feed");
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ item: { kind: "joined", country: "CL", spoon: "wooden" } });
    join(room, "b", 1000, { country: "CL" });
    room.message("b", dig(0, 1), 1000);
    expect(msgs(room.tick(1000)).filter((m) => m.t === "feed")).toHaveLength(0);
  });

  it("announces a 300-in-a-row streak", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "JP" });
    let t = 0;
    for (let seq = 0; seq * 6 < STREAK_COUNT + 6; seq++) {
      t += 500;
      room.message("a", dig(seq, 6), t);
    }
    const items = msgs(room.tick(t))
      .filter((m) => m.t === "feed")
      .map((m) => (m as { item: unknown }).item);
    expect(items).toContainEqual(expect.objectContaining({ kind: "streak", country: "JP", count: 300 }));
  });

  it("finds things now and then", () => {
    const room = new Room(null, 0, { random: () => 0, findChance: 1 });
    join(room, "a", 0);
    room.message("a", dig(0, 1), 0);
    const items = msgs(room.tick(0))
      .filter((m) => m.t === "feed")
      .map((m) => (m as { item: { kind: string } }).item);
    expect(items.some((i) => i.kind === "find")).toBe(true);
  });

  it("records when the world enters a layer and tells everyone", () => {
    const snap = emptySnapshot(0);
    snap.total = LAYERS[1]!.startScoops - 1;
    const room = newRoom(snap);
    join(room, "a", 0);
    const out = room.message("a", dig(0, 3), 5_000);
    expect(msgs(out)).toContainEqual(expect.objectContaining({ t: "layer" }));
    expect(room.seasonInfo.layerEnteredAt[1]).toBe(5_000);
    const feed = msgs(room.tick(5_000)).filter((m) => m.t === "feed");
    expect(feed).toContainEqual(
      expect.objectContaining({ item: expect.objectContaining({ kind: "layer", layer: 1 }) }),
    );
  });

  it("announces a surge of meters", () => {
    const room = newRoom();
    join(room, "a", 0, { ip: "x" });
    room.tick(0);
    // 4 minutes of steady digging from many IPs.
    let t = 0;
    for (let i = 0; i < 20; i++) join(room, `p${i}`, 0, { ip: `ip${i}` });
    const kinds: string[] = [];
    while (t < 4 * 60_000) {
      t += 1000;
      for (let i = 0; i < 20; i++) room.message(`p${i}`, dig(t, 10), t);
      for (const m of msgs(room.tick(t))) if (m.t === "feed") kinds.push(m.item.kind);
    }
    expect(kinds.filter((k) => k === "surge")).toHaveLength(1);
  });
});

describe("Room: activity and replay", () => {
  it("keeps one minute of per-second activity without identities", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "PT" });
    room.message("a", dig(0, 3), 1_200);
    room.message("a", dig(1, 2), 1_700);
    room.message("a", dig(2, 4), 3_100);
    expect(room.activityFrames(3_500)).toEqual([
      { at: 1_000, scoops: 5, countries: { PT: 5 } },
      { at: 3_000, scoops: 4, countries: { PT: 4 } },
    ]);
    expect(room.activityFrames(70_000)).toEqual([]);
  });

  it("answers activity and fame requests", () => {
    const room = newRoom();
    join(room, "a", 0);
    expect(msgs(room.message("a", '{"t":"activity"}', 0), "a")[0]).toMatchObject({ t: "activity" });
    expect(msgs(room.message("a", '{"t":"fame"}', 0), "a")[0]).toEqual({ t: "fame", fame: [] });
  });
});

describe("Room: seasons", () => {
  it("ends the season at Japan, archives it, and starts a new hole", () => {
    const snap = emptySnapshot(0);
    snap.total = ARRIVAL_SCOOPS - 3;
    snap.countries = { BR: 100, JP: 50 };
    const room = newRoom(snap);
    join(room, "a", 0, { country: "JP" });
    join(room, "b", 0, { country: "BR" });
    const out = room.message("a", dig(0, 10), 1_000);
    expect(msgs(out, "a")).toContainEqual({ t: "ack", seq: 0, accepted: 3 });
    const end = msgs(out).find((m) => m.t === "seasonEnd");
    expect(end).toMatchObject({
      t: "seasonEnd",
      entry: { season: 1, endedAt: 1_000, scoops: ARRIVAL_SCOOPS, onlineAtArrival: 2 },
      next: { number: 2, startedAt: 1_000 },
    });
    expect((end as { entry: { topCountries: unknown[] } }).entry.topCountries[0]).toEqual({
      code: "BR",
      scoops: 100,
    });
    expect(room.totalScoops).toBe(0);
    expect(room.seasonInfo.number).toBe(2);
    expect(room.snapshot(2_000).fame).toHaveLength(1);
    room.message("b", dig(0, 2), 1_500);
    expect(room.totalScoops).toBe(2);
  });
});

describe("Room: snapshots", () => {
  it("round-trips through a snapshot", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "AR" });
    room.message("a", dig(0, 7), 86_400_000 * 3);
    expect(room.needsSnapshot).toBe(true);
    const snap = room.snapshot(86_400_000 * 3 + 1);
    room.markSnapshotted();
    expect(room.needsSnapshot).toBe(false);
    const restored = new Room(validateSnapshot(JSON.parse(JSON.stringify(snap))), 0);
    expect(restored.totalScoops).toBe(7);
    expect(restored.countryStats()).toEqual([{ code: "AR", players: 0, scoops: 7 }]);
  });

  it("does not persist the unknown-country bucket", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "XX" });
    room.message("a", dig(0, 2), 0);
    expect(room.snapshot(0).countries).toEqual({});
  });

  it("computes the weekly pace", () => {
    const day = 86_400_000;
    const snap = emptySnapshot(0);
    snap.days = [
      [10, 100],
      [12, 200],
      [2, 9999],
    ];
    const room = newRoom(snap);
    const week = room.weekRate(13 * day);
    expect(week.scoops).toBe(300);
    expect(week.spanMs).toBe(3 * day);
  });
});

describe("Room: hibernation", () => {
  it("exports and resumes connections", () => {
    const room = newRoom();
    join(room, "a", 0, { country: "JP" });
    room.message("a", encode({ t: "spoon", spoon: "bent" }), 0);
    const info = room.connectionInfo("a")!;
    expect(info).toEqual({ ip: "ip-a", country: "JP", spoon: "bent", claimed: 0, hello: true });
    const woke = newRoom();
    woke.resume("a", info, 10);
    expect(woke.players).toBe(1);
    expect(msgs(woke.message("a", dig(0, 2), 10), "a")).toContainEqual({ t: "ack", seq: 0, accepted: 2 });
    expect(woke.rim()[0]).toMatchObject({ spoon: "bent", country: "JP" });
    expect(room.connectionInfo("ghost")).toBeNull();
  });
});
