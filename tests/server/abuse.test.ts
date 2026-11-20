import { describe, expect, it } from "vitest";
import { LIMITS, PROTOCOL_VERSION, encode } from "../../shared/protocol";
import { Room } from "../../server/room";

/** The room takes input from anyone on the internet. These are the ways people will poke at it. */
const hello = encode({ t: "hello", v: PROTOCOL_VERSION, spoon: "teaspoon", scoops: 0 });

function joined(id = "a", ip = "1.1.1.1", country = "BR") {
  const room = new Room(null, 0, { random: () => 0.99 });
  room.connect(id, { ip, country }, 0);
  room.message(id, hello, 0);
  return room;
}

describe("abuse", () => {
  it("a click bot at 1,000 scoops a second still adds at most the rate limit", () => {
    const room = joined();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += 100;
      room.message("a", encode({ t: "dig", seq: i, n: LIMITS.maxBatch }), t);
    }
    // 60 seconds at 15/s plus the initial burst.
    expect(room.totalScoops).toBeLessThanOrEqual(60 * LIMITS.scoopsPerSecond + LIMITS.scoopBurst);
  });

  it("replaying the same batch over and over is just more rate-limited scoops", () => {
    const room = joined();
    const same = encode({ t: "dig", seq: 1, n: 10 });
    for (let i = 0; i < 100; i++) room.message("a", same, i * 10);
    expect(room.totalScoops).toBeLessThanOrEqual(LIMITS.scoopBurst + 15);
  });

  it("many sockets from one IP share one budget and hit the connection cap", () => {
    const room = new Room(null, 0);
    const accepted: string[] = [];
    for (let i = 0; i < 50; i++) {
      const out = room.connect(`c${i}`, { ip: "6.6.6.6", country: "BR" }, 0);
      if (out.close.length === 0) {
        accepted.push(`c${i}`);
        room.message(`c${i}`, hello, 0);
      }
    }
    expect(accepted).toHaveLength(LIMITS.connectionsPerIp);
    for (let s = 0; s < 10; s++)
      for (const id of accepted) room.message(id, encode({ t: "dig", seq: s, n: 15 }), s * 1000);
    expect(room.totalScoops).toBeLessThanOrEqual(LIMITS.ipScoopBurst + 9 * LIMITS.ipScoopsPerSecond);
  });

  it("oversized, binary, deeply nested and malformed messages are strikes, never crashes", () => {
    const room = joined();
    const bad: unknown[] = [
      "x".repeat(10_000),
      null,
      new Uint8Array([1, 2, 3]),
      "[".repeat(100) + "]".repeat(100),
      '{"t":"dig","seq":1,"n":1e400}',
      '{"t":"dig","seq":"1","n":1}',
      '{"t":"hello","v":1,"spoon":"teaspoon","scoops":0}', // second hello
      "{}",
    ];
    for (const [i, raw] of bad.entries()) expect(() => room.message("a", raw, i * 1000)).not.toThrow();
    expect(room.totalScoops).toBe(0);
    expect(room.counters.badMessages).toBe(bad.length);
  });

  it("keeps closing a socket that only sends garbage", () => {
    const room = joined();
    let closed = false;
    for (let i = 0; i < LIMITS.maxStrikes + 5 && !closed; i++) {
      closed = room.message("a", "nope", i * 1000).close.includes("a");
    }
    expect(closed).toBe(true);
  });

  it("can't claim a country: it comes from the connection, not the message", () => {
    const room = joined("a", "1.1.1.1", "BR");
    room.message("a", '{"t":"dig","seq":0,"n":3,"country":"JP"}', 0);
    expect(room.countryStats().map((c) => c.code)).toEqual(["BR"]);
  });

  it("caps the claimed lifetime count shown on the rim tag", () => {
    const room = new Room(null, 0);
    room.connect("a", { ip: "1", country: "BR" }, 0);
    room.message(
      "a",
      encode({ t: "hello", v: PROTOCOL_VERSION, spoon: "teaspoon", scoops: Number.MAX_SAFE_INTEGER }),
      0,
    );
    expect(room.rim()[0]!.scoops).toBe(LIMITS.maxClaimedScoops);
  });
});

describe("abuse: silent sockets", () => {
  it("closes sockets that never say hello, freeing the slot", () => {
    const room = new Room(null, 0, { maxPlayers: 2 });
    room.connect("silent", { ip: "1", country: "BR" }, 0);
    room.connect("ok", { ip: "2", country: "BR" }, 0);
    room.message("ok", hello, 0);
    expect(room.idle).toBe(false);
    expect(room.tick(5_000).close).toEqual([]);
    expect(room.tick(10_001).close).toEqual(["silent"]);
    expect(room.connections).toBe(1);
    expect(room.connect("new", { ip: "3", country: "BR" }, 10_002).close).toEqual([]);
  });
});
