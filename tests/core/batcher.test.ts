import { describe, expect, it } from "vitest";
import { Batcher, MAX_OFFLINE_SCOOPS } from "../../src/core/batcher";
import { LIMITS } from "../../shared/protocol";

function setup(online = true) {
  const sent: [number, number][] = [];
  const state = { online };
  const b = new Batcher((seq, n) => {
    if (!state.online) return false;
    sent.push([seq, n]);
    return true;
  }, 0);
  return { b, sent, state };
}

describe("Batcher", () => {
  it("batches local scoops and sends them on flush", () => {
    const { b, sent } = setup();
    for (let i = 0; i < 5; i++) expect(b.dig(i * 10)).toBe(true);
    expect(b.pending).toBe(5);
    b.flush(100);
    expect(sent).toEqual([[0, 5]]);
    expect(b.pending).toBe(5);
    expect(b.ack(0, 5)).toBe(5);
    expect(b.pending).toBe(0);
  });

  it("doesn't count clicks above the server's rate", () => {
    const { b } = setup();
    let counted = 0;
    for (let i = 0; i < 100; i++) if (b.dig(0)) counted++;
    expect(counted).toBe(LIMITS.scoopBurst);
  });

  it("sends nothing when there is nothing to send", () => {
    const { b, sent } = setup();
    b.flush(0);
    expect(sent).toEqual([]);
  });

  it("keeps scoops while offline (capped) and drains them at the server's pace", () => {
    const { b, sent, state } = setup(false);
    let t = 0;
    for (let i = 0; i < 2_000; i++) {
      t += 50;
      b.dig(t);
      b.flush(t);
    }
    expect(sent).toEqual([]);
    expect(b.unsentCount).toBe(MAX_OFFLINE_SCOOPS);
    state.online = true;
    b.flush(t);
    expect(sent[0]![1]).toBeLessThanOrEqual(LIMITS.scoopBurst);
    b.flush(t + 1000);
    expect(sent[1]![1]).toBeLessThanOrEqual(LIMITS.scoopsPerSecond);
  });

  it("clamps acks and ignores unknown or repeated seqs", () => {
    const { b } = setup();
    b.dig(0);
    b.dig(0);
    b.flush(0);
    expect(b.ack(0, 99)).toBe(2);
    expect(b.ack(0, 2)).toBe(0);
    expect(b.ack(7, 2)).toBe(0);
  });

  it("drops in-flight batches on disconnect rather than risk counting twice", () => {
    const { b } = setup();
    b.dig(0);
    b.flush(0);
    b.dig(10);
    b.disconnected();
    expect(b.pending).toBe(1);
  });
});
