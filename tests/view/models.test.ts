import { Box3, Mesh, MeshPhysicalMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SPOONS } from "../../shared/data/spoons";
import { HOLE_RADIUS, HoleScene, groundHeight } from "../../src/view/hole-scene";
import { FINISHES, SPOON_LENGTH, buildSpoon } from "../../src/view/spoon-model";
import {
  dotRadius,
  latLonToVector,
  project,
  unwrapRing,
  countryLatLon,
  HOLE_LAT_LON,
} from "../../src/view/geo";
import { ValueNoise, mulberry32, ramp } from "../../src/view/noise";

describe("spoon models", () => {
  it.each(SPOONS.map((s) => s.id))("builds %s with a bowl and a handle along +Z", (id) => {
    const g = buildSpoon(id);
    expect(g.getObjectByName("bowl")).toBeInstanceOf(Mesh);
    expect(g.getObjectByName("handle")).toBeInstanceOf(Mesh);
    const box = new Box3().setFromObject(g);
    expect(box.max.z).toBeGreaterThan(SPOON_LENGTH * 0.8);
    expect(box.min.z).toBeGreaterThan(-0.05);
  });

  it("gives each finish the right material", () => {
    const mat = (id: (typeof SPOONS)[number]["id"]) =>
      (buildSpoon(id).getObjectByName("bowl") as Mesh).material as MeshPhysicalMaterial;
    expect(mat("teaspoon").metalness).toBe(1);
    expect(mat("teaspoon").roughness).toBeLessThan(0.1);
    expect(mat("wooden").metalness).toBe(0);
    expect(mat("golden").color.getHexString()).toBe("d4a93c");
    expect(FINISHES.enamel.clearcoat).toBeGreaterThan(0.5);
  });

  it("kinks the bent spoon", () => {
    const straight = buildSpoon("soup").children[1]!.rotation.x;
    const bent = buildSpoon("bent").children[1]!.rotation.x;
    expect(bent).toBeLessThan(straight - 0.3);
  });
});

describe("hole geometry", () => {
  it("has a funnel into the hole, a mound around it and flat lawn beyond", () => {
    expect(groundHeight(0, 0)).toBeLessThan(-0.3);
    expect(groundHeight(1.8, 0)).toBeGreaterThan(0.1);
    expect(groundHeight(6, 6)).toBe(0);
  });

  it("builds a radial ground that leaves the hole open", () => {
    const g = HoleScene.groundGeometry(10, 32);
    const pos = g.attributes.position!;
    let minR = Infinity;
    for (let i = 0; i < pos.count; i++) minR = Math.min(minR, Math.hypot(pos.getX(i), pos.getZ(i)));
    expect(minR).toBeCloseTo(HOLE_RADIUS * 0.95, 5);
    expect(g.index!.count).toBe(10 * 32 * 6);
  });

  it("builds a grass blade that tapers to the tip", () => {
    const g = HoleScene.bladeGeometry();
    const pos = g.attributes.position!;
    const v = new Vector3();
    v.fromBufferAttribute(pos, pos.count - 1);
    expect(v.y).toBeCloseTo(1, 5);
    expect(Math.abs(pos.getX(0))).toBeGreaterThan(Math.abs(v.x));
  });
});

describe("geo", () => {
  it("projects lat/lon to the sphere and the map", () => {
    const [x, y, z] = latLonToVector(0, 0);
    expect([x, y, z].map((n) => Math.round(n * 1000) / 1000)).toEqual([0, 0, 1]);
    expect(latLonToVector(90, 0)[1]).toBeCloseTo(1, 6);
    expect(project(-180, 90, 200, 100)).toEqual([0, 0]);
    expect(project(0, 0, 200, 100)).toEqual([100, 50]);
  });

  it("unwraps rings across the antimeridian", () => {
    expect(
      unwrapRing([
        [179, 0],
        [-179, 1],
        [-178, 2],
      ]),
    ).toEqual([
      [179, 0],
      [181, 1],
      [182, 2],
    ]);
  });

  it("knows country centroids (countries only) and where the hole is", () => {
    expect(countryLatLon("BR")).toEqual([-10, -55]);
    expect(countryLatLon("XX")).toBeNull();
    expect(HOLE_LAT_LON[0]).toBeLessThan(-20);
    expect(dotRadius(0)).toBeGreaterThan(0);
    expect(dotRadius(1000)).toBeGreaterThan(dotRadius(10));
  });
});

describe("noise", () => {
  it("is deterministic and in range", () => {
    const a = new ValueNoise(1);
    const b = new ValueNoise(1);
    for (let i = 0; i < 50; i++) {
      const v = a.fbm(i * 0.37, i * 0.11);
      expect(v).toBe(b.fbm(i * 0.37, i * 0.11));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(mulberry32(5)()).toBe(mulberry32(5)());
    expect(ramp(["#000000", "#808080", "#ffffff"], 0.5)).toEqual([128, 128, 128]);
  });
});
