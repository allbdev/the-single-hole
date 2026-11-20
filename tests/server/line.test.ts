import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, encode, type ServerMessage } from "../../shared/protocol";
import { ALL, Room, type Output } from "../../server/room";

const hello = encode({ t: "hello", v: PROTOCOL_VERSION, spoon: "wooden", scoops: 0 });
const dig = (seq: number, n: number) => encode({ t: "dig", seq, n });

function msgs(out: Output, target?: string): ServerMessage[] {
  return out.send.filter(([to]) => target === undefined || to === target).map(([, m]) => m);
}

/** A room with `seats` slots and a short line update gap. */
function newRoom(seats: number, extra: { maxWaiting?: number } = {}) {
  return new Room(null, 0, { maxPlayers: seats, lineMs: 1_000, random: () => 0.99, ...extra });
}

function join(room: Room, id: string, now = 0): Output {
  room.connect(id, { ip: `ip-${id}`, country: "BR" }, now);
  return room.message(id, hello, now);
}

describe("Room: the line", () => {
  it("puts newcomers in line once the room is full and tells them their place", () => {
    const room = newRoom(2);
    join(room, "a");
    join(room, "b");
    expect(msgs(join(room, "c"), "c")).toEqual([{ t: "line", position: 1 }]);
    expect(msgs(join(room, "d"), "d")).toEqual([{ t: "line", position: 2 }]);
    expect(room.players).toBe(2);
    expect(room.waiting).toBe(2);
    expect(room.inRoom("a")).toBe(true);
    expect(room.inRoom("c")).toBe(false);
  });

  it("keeps people in line out of the room's numbers and broadcasts", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    const out = room.tick(0);
    expect(msgs(out).find((m) => m.t === "state")).toMatchObject({ players: 1 });
    expect(room.rim().map((r) => r.id)).toEqual(["a"]);
    expect(room.countryStats().find((c) => c.code === "BR")?.players).toBe(1);
    // Everything from the room goes to ALL (players only), nothing is addressed to the line.
    expect(out.send.some(([to]) => to === "b")).toBe(false);
  });

  it("ignores digging from the line", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    expect(room.message("b", dig(1, 10), 0)).toEqual({ send: [], close: [], admitted: [] });
    expect(room.totalScoops).toBe(0);
  });

  it("lets the first in line in when a player leaves, with a welcome", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    join(room, "c");
    room.disconnect("a");
    expect(room.idle).toBe(false);
    const out = room.tick(100);
    expect(out.admitted).toEqual(["b"]);
    expect(msgs(out, "b")[0]).toMatchObject({ t: "welcome", you: "b", players: 1 });
    expect(msgs(out, "c")).toEqual([{ t: "line", position: 1 }]);
    expect(room.inRoom("b")).toBe(true);
    expect(room.message("b", dig(1, 5), 100).send).toEqual([["b", { t: "ack", seq: 1, accepted: 5 }]]);
  });

  it("never lets a newcomer skip the line while a slot waits for the next tick", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    room.disconnect("a");
    expect(msgs(join(room, "c"), "c")).toEqual([{ t: "line", position: 2 }]);
    expect(room.tick(0).admitted).toEqual(["b"]);
  });

  it("moves everyone up when someone ahead gives up, at most once per lineMs", () => {
    const room = newRoom(1);
    join(room, "a");
    for (const id of ["b", "c", "d"]) join(room, id);
    room.disconnect("b");
    const first = room.tick(0);
    expect(msgs(first, "c")).toEqual([{ t: "line", position: 1 }]);
    expect(msgs(first, "d")).toEqual([{ t: "line", position: 2 }]);
    room.disconnect("c");
    expect(msgs(room.tick(500), "d")).toEqual([]);
    expect(msgs(room.tick(1_000), "d")).toEqual([{ t: "line", position: 1 }]);
  });

  it("goes quiet again once the line is up to date", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    room.tick(0);
    expect(room.idle).toBe(true);
  });

  it("answers a hello in constant time, without scanning the line (no quadratic flood)", () => {
    const room = newRoom(0, { maxWaiting: 100_000 });
    const n = 20_000;
    for (let i = 0; i < n; i++) room.connect(`w${i}`, { ip: `ip${i}`, country: "BR" }, 0);
    const scan = vi.spyOn(room, "linePosition");
    // Hellos arrive out of order: the newest ticket answers at once, the rest wait for the pass.
    expect(msgs(room.message(`w${n - 1}`, hello, 0))).toEqual([{ t: "line", position: n }]);
    for (let i = 0; i < n - 1; i++) expect(room.message(`w${i}`, hello, 0).send).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
    const pass = room.tick(1);
    expect(msgs(pass, "w0")).toEqual([{ t: "line", position: 1 }]);
    expect(msgs(pass, `w${n - 2}`)).toEqual([{ t: "line", position: n - 1 }]);
    expect(msgs(pass, `w${n - 1}`)).toEqual([]);
  });

  it("closes silent sockets in the line too", () => {
    const room = newRoom(1);
    join(room, "a");
    room.connect("silent", { ip: "x", country: "BR" }, 0);
    expect(room.waiting).toBe(1);
    expect(room.tick(10_001).close).toEqual(["silent"]);
    expect(room.waiting).toBe(0);
  });

  it("admits someone who hasn't said hello yet without a welcome, then welcomes them on hello", () => {
    const room = newRoom(1);
    join(room, "a");
    room.connect("b", { ip: "b", country: "BR" }, 0);
    room.disconnect("a");
    const out = room.tick(10);
    expect(out.admitted).toEqual(["b"]);
    expect(msgs(out, "b")).toEqual([]);
    expect(msgs(room.message("b", hello, 20), "b")[0]).toMatchObject({ t: "welcome", you: "b" });
  });

  it("counts the line against the per-IP limit and frees it on leave", () => {
    const room = newRoom(0);
    for (let i = 0; i < 10; i++) room.connect(`c${i}`, { ip: "same", country: "BR" }, 0);
    expect(msgs(room.connect("extra", { ip: "same", country: "BR" }, 0))).toEqual([
      { t: "error", code: "tooManyFromIp" },
    ]);
    room.disconnect("c0");
    expect(room.connect("again", { ip: "same", country: "BR" }, 0).close).toEqual([]);
  });

  it("refuses with 'full' only when the line hits its safety cap", () => {
    const room = newRoom(1, { maxWaiting: 2 });
    join(room, "a");
    join(room, "b");
    join(room, "c");
    const refused = room.connect("d", { ip: "ip-d", country: "BR" }, 0);
    expect(msgs(refused, "d")).toEqual([{ t: "error", code: "full" }]);
    expect(refused.close).toEqual(["d"]);
  });

  it("strikes messages before hello in the line like anywhere else", () => {
    const room = newRoom(1);
    join(room, "a");
    room.connect("b", { ip: "b", country: "BR" }, 0);
    room.message("b", dig(1, 1), 0);
    expect(room.counters.badMessages).toBe(1);
  });

  it("puts everyone back in the same order after hibernation", () => {
    const room = newRoom(1);
    for (const id of ["a", "b", "c", "d"]) join(room, id);
    const saved = ["d", "a", "c", "b"].map((id) => [id, room.connectionInfo(id)!] as const);
    expect(saved.find(([id]) => id === "a")![1].ticket).toBeUndefined();
    expect(saved.find(([id]) => id === "b")![1].ticket).toBeDefined();

    const woke = newRoom(1);
    for (const [id, info] of saved) woke.resume(id, info, 50);
    expect(woke.inRoom("a")).toBe(true);
    expect(["b", "c", "d"].map((id) => woke.linePosition(id))).toEqual([1, 2, 3]);
    const out = woke.tick(60);
    expect(msgs(out, "d")).toEqual([{ t: "line", position: 3 }]);
    // New arrivals after the wake-up still go to the back.
    expect(msgs(join(woke, "e", 70), "e")).toEqual([{ t: "line", position: 4 }]);
    woke.disconnect("a");
    expect(woke.tick(80).admitted).toEqual(["b"]);
  });

  it("broadcasts to ALL, which adapters deliver to the room only", () => {
    const room = newRoom(1);
    join(room, "a");
    join(room, "b");
    room.message("a", dig(1, 3), 0);
    const targets = new Set(room.tick(0).send.map(([to]) => to));
    expect(targets).toEqual(new Set([ALL]));
  });
});
