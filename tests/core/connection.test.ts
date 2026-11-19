import { describe, expect, it, vi } from "vitest";
import { Connection, backoffMs, type SocketLike } from "../../src/core/connection";

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(data: string) {
    this.onmessage?.({ data });
  }
}

function setup() {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const messages: unknown[] = [];
  const conn = new Connection(
    "ws://x/ws",
    {
      onOpen: () => events.push("open"),
      onMessage: (m) => messages.push(m),
      onStatus: (s) => events.push(`status:${s}`),
    },
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    globalThis,
    () => 0.5,
  );
  return { conn, sockets, events, messages };
}

describe("backoffMs", () => {
  it("doubles up to 30 s with jitter", () => {
    expect(backoffMs(0, () => 0.5)).toBe(1000);
    expect(backoffMs(3, () => 0.5)).toBe(8000);
    expect(backoffMs(20, () => 0.5)).toBe(30000);
    expect(backoffMs(0, () => 0)).toBe(800);
    expect(backoffMs(0, () => 1)).toBe(1200);
  });
});

describe("Connection", () => {
  it("opens, sends and parses messages", () => {
    const { conn, sockets, events, messages } = setup();
    conn.start();
    expect(conn.send({ t: "fame" })).toBe(false);
    sockets[0]!.open();
    expect(events).toContain("open");
    expect(conn.send({ t: "fame" })).toBe(true);
    expect(sockets[0]!.sent).toEqual(['{"t":"fame"}']);
    sockets[0]!.receive('{"t":"ack","seq":1,"accepted":1}');
    sockets[0]!.receive("not json");
    expect(messages).toEqual([{ t: "ack", seq: 1, accepted: 1 }]);
    vi.useRealTimers();
  });

  it("reconnects with backoff after a drop", () => {
    const { conn, sockets, events } = setup();
    conn.start();
    sockets[0]!.open();
    sockets[0]!.close();
    expect(events.at(-1)).toBe("status:waiting");
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(sockets).toHaveLength(2);
    vi.useRealTimers();
  });

  it("does not come back after a version error", () => {
    const { conn, sockets } = setup();
    conn.start();
    sockets[0]!.open();
    sockets[0]!.receive('{"t":"error","code":"version"}');
    sockets[0]!.close();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    vi.useRealTimers();
  });

  it("stops cleanly", () => {
    const { conn, sockets } = setup();
    conn.start();
    sockets[0]!.open();
    conn.stop();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    vi.useRealTimers();
  });
});
