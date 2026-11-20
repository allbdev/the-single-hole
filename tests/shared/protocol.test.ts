import { describe, expect, it } from "vitest";
import {
  LIMITS,
  PROTOCOL_VERSION,
  encode,
  normalizeCountry,
  normalizeRegion,
  parseClientMessage,
  parseServerMessage,
} from "../../shared/protocol";
import { TokenBucket } from "../../shared/token-bucket";

describe("parseClientMessage", () => {
  it("accepts valid messages", () => {
    expect(
      parseClientMessage(encode({ t: "hello", v: PROTOCOL_VERSION, spoon: "wooden", scoops: 12 })),
    ).toEqual({
      t: "hello",
      v: PROTOCOL_VERSION,
      spoon: "wooden",
      scoops: 12,
    });
    expect(parseClientMessage('{"t":"dig","seq":0,"n":3}')).toEqual({ t: "dig", seq: 0, n: 3 });
    expect(parseClientMessage('{"t":"spoon","spoon":"bent"}')).toEqual({ t: "spoon", spoon: "bent" });
    expect(parseClientMessage('{"t":"activity"}')).toEqual({ t: "activity" });
    expect(parseClientMessage('{"t":"fame"}')).toEqual({ t: "fame" });
  });

  it("clamps the claimed lifetime count", () => {
    const m = parseClientMessage(
      `{"t":"hello","v":1,"spoon":"teaspoon","scoops":${LIMITS.maxClaimedScoops * 5}}`,
    );
    expect(m).toMatchObject({ scoops: LIMITS.maxClaimedScoops });
  });

  it.each([
    ["not a string", 42],
    ["not json", "{nope"],
    ["array", "[1,2]"],
    ["null", "null"],
    ["unknown type", '{"t":"explode"}'],
    ["missing seq", '{"t":"dig","n":1}'],
    ["zero batch", '{"t":"dig","seq":1,"n":0}'],
    ["negative batch", '{"t":"dig","seq":1,"n":-4}'],
    ["fractional batch", '{"t":"dig","seq":1,"n":1.5}'],
    ["huge batch", `{"t":"dig","seq":1,"n":${LIMITS.maxBatch + 1}}`],
    ["string batch", '{"t":"dig","seq":1,"n":"3"}'],
    ["negative seq", '{"t":"dig","seq":-1,"n":1}'],
    ["unsafe int", '{"t":"dig","seq":1e300,"n":1}'],
    ["bad spoon", '{"t":"hello","v":1,"spoon":"spork","scoops":0}'],
    ["negative claim", '{"t":"hello","v":1,"spoon":"teaspoon","scoops":-1}'],
    ["oversized", `{"t":"fame","pad":"${"x".repeat(LIMITS.maxClientMessageBytes)}"}`],
    ["proto pollution", '{"t":"dig","seq":1,"n":1,"__proto__":{"x":1}}'],
  ])("rejects %s", (_name, raw) => {
    const result = parseClientMessage(raw);
    if (_name === "proto pollution") {
      expect(result).toEqual({ t: "dig", seq: 1, n: 1 });
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    } else {
      expect(result).toBeNull();
    }
  });
});

describe("parseServerMessage", () => {
  it("keeps known messages and drops the rest", () => {
    expect(parseServerMessage('{"t":"ack","seq":1,"accepted":2}')).toEqual({ t: "ack", seq: 1, accepted: 2 });
    expect(parseServerMessage('{"t":"wat"}')).toBeNull();
    expect(parseServerMessage('{"t":"line","position":3}')).toEqual({ t: "line", position: 3 });
    expect(parseServerMessage("garbage")).toBeNull();
    expect(parseServerMessage(5)).toBeNull();
    expect(parseServerMessage("null")).toBeNull();
  });
});

describe("normalizeCountry", () => {
  it("keeps alpha-2 codes and hides everything else", () => {
    expect(normalizeCountry("br")).toBe("BR");
    expect(normalizeCountry(" JP ")).toBe("JP");
    expect(normalizeCountry("T1")).toBe("XX");
    expect(normalizeCountry("BRA")).toBe("XX");
    expect(normalizeCountry("<script>")).toBe("XX");
    expect(normalizeCountry(undefined)).toBe("XX");
    expect(normalizeCountry(null)).toBe("XX");
  });
});

describe("normalizeRegion", () => {
  it("keeps 1 to 3 letters or digits and drops everything else", () => {
    expect(normalizeRegion("es")).toBe("ES");
    expect(normalizeRegion(" 13 ")).toBe("13");
    expect(normalizeRegion("IDF")).toBe("IDF");
    expect(normalizeRegion("ABCD")).toBe("");
    expect(normalizeRegion("BR-ES")).toBe("");
    expect(normalizeRegion("<b>")).toBe("");
    expect(normalizeRegion("")).toBe("");
    expect(normalizeRegion(undefined)).toBe("");
    expect(normalizeRegion(null)).toBe("");
  });
});

describe("TokenBucket", () => {
  it("starts full, refills over time, and never exceeds the burst", () => {
    const b = new TokenBucket(10, 5, 0);
    expect(b.take(100, 0)).toBe(5);
    expect(b.take(1, 0)).toBe(0);
    expect(b.available(100)).toBe(1);
    expect(b.available(10_000)).toBe(5);
  });

  it("ignores time going backwards and fractional or negative requests", () => {
    const b = new TokenBucket(10, 5, 1000);
    expect(b.take(5, 1000)).toBe(5);
    expect(b.available(0)).toBe(0);
    expect(b.take(-3, 2000)).toBe(0);
    expect(b.take(2.9, 2000)).toBe(2);
  });
});
