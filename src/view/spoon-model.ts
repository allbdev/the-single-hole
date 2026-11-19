import {
  BufferGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  type Material,
} from "three";
import { spoonById, type SpoonData, type SpoonFinish, type SpoonId } from "../../shared/data/spoons";

/** Material parameters per finish. Pure numbers, so tests can check them without WebGL. */
export interface FinishParams {
  metalness: number;
  roughness: number;
  clearcoat: number;
  map: "wood" | "speckle" | null;
  roughnessMap: "brushed" | "tarnish" | null;
}

export const FINISHES: Record<SpoonFinish, FinishParams> = {
  mirror: { metalness: 1, roughness: 0.06, clearcoat: 0, map: null, roughnessMap: null },
  brushed: { metalness: 1, roughness: 0.32, clearcoat: 0, map: null, roughnessMap: "brushed" },
  wood: { metalness: 0, roughness: 0.75, clearcoat: 0.1, map: "wood", roughnessMap: null },
  plastic: { metalness: 0, roughness: 0.42, clearcoat: 0.2, map: null, roughnessMap: null },
  tarnished: { metalness: 0.9, roughness: 0.45, clearcoat: 0, map: null, roughnessMap: "tarnish" },
  enamel: { metalness: 0.05, roughness: 0.2, clearcoat: 0.8, map: "speckle", roughnessMap: null },
  gold: { metalness: 1, roughness: 0.18, clearcoat: 0, map: null, roughnessMap: null },
};

/** Spoon length in scene units (meters at the hole's scale). */
export const SPOON_LENGTH = 0.95;

/**
 * The bowl: an ellipse dish, concave on +Y, built as a grid deformed into a paraboloid.
 * Origin at the bowl's tip end so a planted spoon pivots on its tip.
 */
export function bowlGeometry(width = 0.26, length = 0.36, depth = 0.07, seg = 20): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= seg; j++) {
    for (let i = 0; i <= seg; i++) {
      // Polar grid on a unit disk.
      const r = j / seg;
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Egg shape: narrower towards the handle (+z).
      const taper = 1 - 0.18 * (z + 1) * 0.5;
      pos.push(x * (width / 2) * taper, depth * (r * r), (z * length) / 2 + length / 2);
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The handle: a flat tapered shape extruded thin, with a wider end. */
export function handleGeometry(length = SPOON_LENGTH - 0.34, thickness = 0.012): BufferGeometry {
  const s = new Shape();
  const neck = 0.018;
  const end = 0.05;
  s.moveTo(-neck, 0);
  s.bezierCurveTo(-neck * 0.8, length * 0.4, -end * 0.7, length * 0.75, -end, length * 0.92);
  s.quadraticCurveTo(0, length * 1.04, end, length * 0.92);
  s.bezierCurveTo(end * 0.7, length * 0.75, neck * 0.8, length * 0.4, neck, 0);
  s.lineTo(-neck, 0);
  const g = new ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 16,
  });
  // Lay it flat: shape's +Y becomes +Z (along the spoon), thickness becomes Y.
  g.rotateX(Math.PI / 2);
  g.translate(0, thickness / 2, 0);
  return g;
}

export type TextureFactory = (kind: "wood" | "speckle" | "brushed" | "tarnish", color: string) => unknown;

export function spoonMaterial(spoon: SpoonData, textures?: TextureFactory): Material {
  const f = FINISHES[spoon.finish];
  const mat = new MeshPhysicalMaterial({
    color: f.map ? "#ffffff" : spoon.color,
    metalness: f.metalness,
    roughness: f.roughness,
    clearcoat: f.clearcoat,
    side: DoubleSide,
    envMapIntensity: 1.2,
  });
  if (textures && f.map) mat.map = textures(f.map, spoon.color) as MeshStandardMaterial["map"];
  if (textures && f.roughnessMap) {
    mat.roughnessMap = textures(f.roughnessMap, spoon.color) as MeshStandardMaterial["roughnessMap"];
  }
  return mat;
}

/**
 * A whole spoon as a Group, pointing along +Z from the bowl tip (origin) to the handle end. The
 * bent spoon kinks at the neck.
 */
export function buildSpoon(id: SpoonId, textures?: TextureFactory): Group {
  const data = spoonById(id);
  const group = new Group();
  group.name = `spoon-${id}`;
  const mat = spoonMaterial(data, textures);
  const bowlLength = 0.36 * data.size;
  const bowl = new Mesh(bowlGeometry(0.26 * data.size, bowlLength, 0.07 * data.size), mat);
  bowl.name = "bowl";
  bowl.castShadow = true;
  // The dish's rim is higher than its middle: concave side up, like a spoon lying face up.
  const handlePivot = new Group();
  handlePivot.position.set(0, 0.07 * data.size * 0.9, bowlLength * 0.97);
  handlePivot.rotation.x = -0.12 - data.bend;
  const handle = new Mesh(handleGeometry(SPOON_LENGTH - bowlLength), mat);
  handle.name = "handle";
  handle.castShadow = true;
  handlePivot.add(handle);
  group.add(bowl, handlePivot);
  group.userData.spoon = id;
  return group;
}
