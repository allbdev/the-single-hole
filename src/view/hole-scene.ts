import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Texture,
} from "three";
import { LAYERS } from "../../shared/data/layers";
import type { SpoonId } from "../../shared/data/spoons";
import type { RimSlot } from "../core/layout";
import type { Quality } from "../core/quality";
import type { Lighting } from "../core/sun";
import { ValueNoise, mulberry32 } from "./noise";
import { SPOON_LENGTH, buildSpoon, type TextureFactory } from "./spoon-model";
import type { View } from "./stage";
import {
  brushedCanvas,
  dirtCanvas,
  groundCanvas,
  makeCanvas,
  speckleCanvas,
  toTexture,
  woodCanvas,
} from "./textures";

export type HoleTheme = "lawn" | "garden";
export type CameraMode = "landing" | "dig" | "arrival";

export const HOLE_RADIUS = 1.0;
const GROUND_EXTENT = 16;
const SHAFT_DEPTH = 14;

const noise = new ValueNoise(17);

/** Ground height at a point (meters): the funnel into the hole, the dirt mound, flat lawn. */
export function groundHeight(x: number, z: number, mound = 1): number {
  const r = Math.hypot(x, z);
  const bump = (noise.fbm(x * 1.6 + 50, z * 1.6 + 50, 3) - 0.5) * 0.12;
  if (r < HOLE_RADIUS * 0.94) return -0.45;
  if (r < HOLE_RADIUS * 1.1) {
    const t = (r - HOLE_RADIUS * 0.94) / (HOLE_RADIUS * 0.16);
    return -0.35 + t * (0.2 + 0.3 * mound);
  }
  if (r < 3.0) {
    const t = (r - HOLE_RADIUS * 1.1) / (3.0 - HOLE_RADIUS * 1.1);
    return (0.15 + Math.sin(Math.min(1, t * 1.4) * Math.PI) * 0.22 * (1 - t * 0.4) + bump * (1 - t)) * mound;
  }
  if (r < 3.6) return (0.05 * (1 - (r - 3) / 0.6) + bump * 0.2) * mound;
  return 0;
}

const CAMERAS: Record<CameraMode, { pos: Vector3; look: Vector3; fov: number }> = {
  landing: { pos: new Vector3(0, 3.1, 8.6), look: new Vector3(0, 0.2, -0.2), fov: 38 },
  dig: { pos: new Vector3(0, 8.6, 2.6), look: new Vector3(0, -0.2, 0.15), fov: 44 },
  arrival: { pos: new Vector3(2.4, 4.2, 6.4), look: new Vector3(0.6, 0, 0), fov: 40 },
};

interface PlantedSpoon {
  slot: RimSlot;
  spoon: SpoonId;
  outer: Group;
  twist: Group;
  model: Group;
  digT: number;
  ghost: boolean;
  life: number;
}

interface Particle {
  pos: Vector3;
  vel: Vector3;
  life: number;
}

/** The lawn, the hole, the spoons planted around it and the survey props (boards 1, 2, 7, 8). */
export class HoleScene implements View {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 16 / 9, 0.05, 200);
  private mode: CameraMode = "landing";
  private readonly camPos = CAMERAS.landing.pos.clone();
  private readonly camLook = CAMERAS.landing.look.clone();
  private readonly sun = new DirectionalLight("#fff4e2", 2.4);
  private readonly hemi = new HemisphereLight("#cfe3ff", "#4a3b2a", 1);
  private readonly lantern = new PointLight("#ffbf73", 0, 7, 1.6);
  private readonly lanternGroup = new Group();
  private readonly spoons = new Map<string, PlantedSpoon>();
  private readonly ghosts: PlantedSpoon[] = [];
  private readonly textureFactory: TextureFactory;
  private grass: InstancedMesh | null = null;
  private grassShader: { uniforms: { uTime: { value: number } } } | null = null;
  private readonly bottom: Mesh;
  private readonly particles: Particle[] = [];
  private readonly particleMesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly shake = new Vector2();
  private shakeT = 0;
  private readonly reducedMotion: boolean;
  readonly tapeAnchor = new Vector3(0.95, 0.25, 1.55);
  private get mound(): number {
    return this.theme === "garden" ? 0.3 : 1;
  }
  private gh(x: number, z: number): number {
    return groundHeight(x, z, this.mound);
  }

  constructor(
    private readonly quality: Quality,
    readonly theme: HoleTheme,
    environment: Texture | null,
    reducedMotion = false,
  ) {
    this.reducedMotion = reducedMotion;
    this.textureFactory = (kind, color) => {
      if (kind === "wood") return toTexture(woodCanvas(256));
      if (kind === "speckle") return toTexture(speckleCanvas(256, color));
      return toTexture(brushedCanvas(256, kind === "tarnish"), 1, false);
    };
    const sky = new Color("#6f8296");
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, 18, 60);
    this.scene.environment = environment;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.sun.position.set(6, 10, 4);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.scene.add(this.buildGround());
    this.scene.add(this.buildOuterGround());
    this.bottom = this.buildShaft();
    this.scene.add(this.buildClods());
    if (theme === "lawn") {
      this.grass = this.buildGrass();
      this.scene.add(this.grass);
      this.scene.add(this.buildProps());
    } else {
      this.scene.add(this.buildGarden());
    }
    this.scene.add(this.buildTape());
    this.buildLantern();

    const pGeo = new IcosahedronGeometry(0.025, 0);
    this.particleMesh = new InstancedMesh(
      pGeo,
      new MeshStandardMaterial({ color: "#2a1c12", roughness: 1 }),
      220,
    );
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
  }

  // ---------- building ----------

  /** Radial ground: rings around the hole, so the rim is a smooth circle. */
  static groundGeometry(rings: number, segments: number, mound = 1): BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const inner = HOLE_RADIUS * 0.95;
    const outer = GROUND_EXTENT / 2;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const r = inner + (outer - inner) * Math.pow(t, 1.7);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.push(x, groundHeight(x, z, mound), z);
        uv.push(x / GROUND_EXTENT + 0.5, 0.5 - z / GROUND_EXTENT);
      }
    }
    const row = segments + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * row + i;
        const b = a + row;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new PlaneGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildGround(): Mesh {
    const low = this.quality.name === "low";
    const geo = HoleScene.groundGeometry(low ? 60 : 96, low ? 128 : 200, this.mound);
    const map = toTexture(groundCanvas(1024, this.theme));
    map.wrapS = map.wrapT = 1001; // ClampToEdge
    const bump = toTexture(dirtCanvas(256), GROUND_EXTENT / 1.5, false);
    const mat = new MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 1.6,
      roughness: 0.96,
      metalness: 0,
    });
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "ground";
    return mesh;
  }

  private buildOuterGround(): Mesh {
    // Big flat ring beyond the detailed ground, fading into fog.
    const geo = new RingGeometry(GROUND_EXTENT / 2 - 0.6, 110, 64, 1);
    geo.rotateX(-Math.PI / 2);
    const c = makeCanvas(64, 64);
    const ctx = c.getContext("2d")!;
    const rand = mulberry32(9);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const g = this.theme === "lawn" ? 70 + rand() * 30 : 150 + rand() * 25;
        ctx.fillStyle =
          this.theme === "lawn" ? `rgb(${g * 0.55},${g},${g * 0.35})` : `rgb(${g},${g * 0.97},${g * 0.9})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const tex = toTexture(c, 60);
    const mesh = new Mesh(geo, new MeshStandardMaterial({ map: tex, roughness: 1 }));
    mesh.receiveShadow = true;
    mesh.position.y = -0.02;
    return mesh;
  }

  private buildShaft(): Mesh {
    const geo = new CylinderGeometry(HOLE_RADIUS * 1.02, HOLE_RADIUS * 0.9, SHAFT_DEPTH, 64, 28, true);
    geo.translate(0, -0.3 - SHAFT_DEPTH / 2, 0);
    const pos = geo.attributes.position!;
    const colors: number[] = [];
    const n = new ValueNoise(31);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const depth = Math.min(1, (-y - 0.3) / 6);
      const k = Math.max(0.01, 0.55 * (1 - depth) ** 2.6) * (0.85 + n.noise(pos.getX(i) * 3, y * 3) * 0.3);
      // Jagged walls.
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      // Jagged walls, smooth at the top so the rim meets the ground without gaps.
      const jag = 1 + (n.fbm(a * 4 + 9, y * 1.5, 3) - 0.5) * 0.12 * Math.min(1, depth * 4);
      pos.setX(i, pos.getX(i) * jag);
      pos.setZ(i, pos.getZ(i) * jag);
      colors.push(k, k * 0.92, k * 0.85);
    }
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = toTexture(dirtCanvas(256), 1);
    tex.repeat.set(5, 8);
    // Unlit: the darkness down the shaft comes from the baked depth gradient, not the sky light.
    const mat = new MeshBasicMaterial({ map: tex, vertexColors: true, side: BackSide, fog: false });
    const shaft = new Mesh(geo, mat);
    shaft.name = "shaft";
    this.scene.add(shaft);
    const bottom = new Mesh(
      new CircleGeometry(HOLE_RADIUS, 32),
      new MeshBasicMaterial({ color: "#050403", fog: false }),
    );
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.3 - SHAFT_DEPTH + 0.05;
    this.scene.add(bottom);
    return bottom;
  }

  private buildClods(): InstancedMesh {
    const count = this.theme === "garden" ? Math.round(this.quality.clods * 0.25) : this.quality.clods;
    const geo = new IcosahedronGeometry(0.05, 1);
    const p = geo.attributes.position!;
    const n = new ValueNoise(41);
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + n.noise(p.getX(i) * 40 + 3, p.getY(i) * 40 + p.getZ(i) * 30) * 0.5;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const mat = new MeshStandardMaterial({
      color: this.theme === "lawn" ? "#3a2819" : "#6d6a63",
      roughness: 1,
      bumpMap: toTexture(dirtCanvas(128), 2, false),
      bumpScale: 2,
    });
    const mesh = new InstancedMesh(geo, mat, count);
    const rand = mulberry32(43);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = HOLE_RADIUS * 1.08 + Math.pow(rand(), 0.8) * (this.theme === "garden" ? 0.4 : 2.0);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.3 + Math.pow(rand(), 3) * 1.6;
      this.dummy.position.set(x, this.gh(x, z) + 0.01 * s, z);
      this.dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      c.setHSL(0.07, 0.3 + rand() * 0.15, 0.1 + rand() * 0.08);
      mesh.setColorAt(i, c);
    }
    mesh.castShadow = this.quality.shadows;
    mesh.receiveShadow = true;
    mesh.name = "clods";
    return mesh;
  }

  /** One grass blade: a thin tapered strip, slightly curved. */
  static bladeGeometry(): BufferGeometry {
    const segs = 4;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.016 * (1 - t * 0.85);
      const bend = t * t * 0.05;
      pos.push(-w, t, bend, w, t, bend);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new PlaneGeometry(); // replaced attributes below
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.deleteAttribute("uv");
    g.computeVertexNormals();
    return g;
  }

  private buildGrass(): InstancedMesh {
    const count = this.quality.grassBlades;
    const geo = HoleScene.bladeGeometry();
    const mat = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.grassShader = shader as unknown as { uniforms: { uTime: { value: number } } };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float sway = sin(uTime * 1.6 + root.x * 0.7 + root.z * 0.5) * 0.5 + sin(uTime * 2.7 + root.x * 1.9) * 0.25;
           transformed.x += sway * 0.09 * position.y * position.y;`,
        );
    };
    const mesh = new InstancedMesh(geo, mat, count);
    const rand = mulberry32(13);
    const c = new Color();
    const n = new ValueNoise(5);
    let placed = 0;
    const R = 10;
    for (let tries = 0; placed < count && tries < count * 3; tries++) {
      const a = rand() * Math.PI * 2;
      const r0 = 2.7;
      const r = Math.sqrt(rand() * (R * R - r0 * r0) + r0 * r0);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const edge = 3.1 + (n.fbm(x / 1.6 + 30, z / 1.6 + 30, 3) - 0.5) * 1.1;
      if (r < edge && rand() > 0.08) continue;
      const h = 0.12 + rand() * 0.18 + n.noise(x * 0.8, z * 0.8) * 0.1;
      this.dummy.position.set(x, this.gh(x, z) - 0.01, z);
      this.dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
      this.dummy.scale.set(1 + rand(), h, 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(placed, this.dummy.matrix);
      const dry = n.noise(x * 0.4 + 7, z * 0.4) * 0.5;
      c.setHSL(0.26 - dry * 0.06, 0.55 + rand() * 0.2, 0.07 + rand() * 0.07 + dry * 0.04);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    mesh.receiveShadow = true;
    mesh.name = "grass";
    return mesh;
  }

  private buildProps(): Group {
    const props = new Group();
    props.name = "props";
    // Galvanized bucket behind the hole.
    const profile = [
      new Vector2(0, 0),
      new Vector2(0.27, 0),
      new Vector2(0.285, 0.01),
      new Vector2(0.34, 0.46),
      new Vector2(0.35, 0.47),
    ];
    const bucketMat = new MeshStandardMaterial({
      color: "#b9bfc4",
      metalness: 0.85,
      roughness: 0.42,
      side: DoubleSide,
    });
    const bucket = new Mesh(new LatheGeometry(profile, 40), bucketMat);
    bucket.castShadow = true;
    for (const y of [0.12, 0.32]) {
      const ring = new Mesh(new TorusGeometry(0.28 + y * 0.13, 0.006, 6, 40), bucketMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      bucket.add(ring);
    }
    const dirt = new Mesh(
      new CircleGeometry(0.33, 24),
      new MeshStandardMaterial({ color: "#2a1d13", roughness: 1 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.4;
    bucket.add(dirt);
    bucket.position.set(0.25, 0, -3.7);
    props.add(bucket);

    // Survey flags.
    const flagMat = new MeshStandardMaterial({ color: "#ff5a1f", roughness: 0.6, side: DoubleSide });
    const poleMat = new MeshStandardMaterial({ color: "#d9dcdf", metalness: 0.6, roughness: 0.35 });
    const flags: [number, number][] = [
      [-1.4, -6.5],
      [4.6, -4.2],
      [6.3, 1.2],
      [-5.6, -1.4],
      [3.4, 3.9],
    ];
    flags.forEach(([x, z], i) => {
      const flag = new Group();
      const pole = new Mesh(new CylinderGeometry(0.006, 0.006, 1.1, 6), poleMat);
      pole.position.y = 0.55;
      const cloth = new Mesh(new PlaneGeometry(0.26, 0.17, 6, 1), flagMat);
      const cp = cloth.geometry.attributes.position!;
      for (let k = 0; k < cp.count; k++) cp.setZ(k, Math.sin(cp.getX(k) * 18 + i) * 0.015);
      cloth.geometry.computeVertexNormals();
      cloth.position.set(0.13, 1.0, 0);
      flag.add(pole, cloth);
      flag.position.set(x, 0, z);
      flag.rotation.set(0.05 * (i % 2 ? 1 : -1), i * 1.3, 0.07);
      flag.castShadow = true;
      props.add(flag);
    });
    return props;
  }

  private buildTape(): Group {
    const g = new Group();
    g.name = "tape";
    const yellow = new MeshStandardMaterial({ color: "#f2c81e", roughness: 0.45 });
    const caseMesh = new Mesh(new BoxGeometry(0.15, 0.065, 0.15), yellow);
    caseMesh.position.set(1.05, this.gh(1.05, 1.9) + 0.04, 1.9);
    caseMesh.rotation.y = 0.5;
    caseMesh.castShadow = true;
    const hub = new Mesh(
      new CylinderGeometry(0.035, 0.035, 0.07, 16),
      new MeshStandardMaterial({ color: "#1a1a1a" }),
    );
    hub.position.copy(caseMesh.position);
    // Tape: a ribbon from the case over the lip and down into the hole.
    const pts = [
      new Vector3(1.0, this.gh(1.0, 1.82) + 0.03, 1.82),
      new Vector3(0.82, this.gh(0.82, 1.45) + 0.03, 1.45),
      new Vector3(0.62, 0.02, 1.02),
      new Vector3(0.55, -0.5, 0.82),
      new Vector3(0.5, -3.5, 0.78),
    ];
    const curve = new CatmullRomCurve3(pts);
    const segs = 60;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new Vector3().crossVectors(tan, up).normalize();
      if (side.lengthSq() < 0.1) side.set(1, 0, 0);
      side.multiplyScalar(0.022);
      pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
      uv.push(0, t * 30, 1, t * 30);
      if (i < segs) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new PlaneGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ticks = makeCanvas(32, 128);
    const ctx = ticks.getContext("2d")!;
    ctx.fillStyle = "#f2c81e";
    ctx.fillRect(0, 0, 32, 128);
    ctx.fillStyle = "#1b1b1b";
    for (let i = 0; i < 16; i++) ctx.fillRect(0, i * 8, i % 4 === 0 ? 18 : 9, 1.5);
    const tex = new CanvasTexture(ticks);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = tex.wrapT = 1000; // Repeat
    const ribbon = new Mesh(geo, new MeshStandardMaterial({ map: tex, roughness: 0.4, side: DoubleSide }));
    ribbon.castShadow = true;
    g.add(caseMesh, hub, ribbon);
    this.tapeAnchor.copy(caseMesh.position).add(new Vector3(0.1, 0.12, 0));
    return g;
  }

  private buildLantern(): void {
    const glass = new Mesh(
      new CylinderGeometry(0.06, 0.06, 0.14, 16),
      new MeshStandardMaterial({
        color: "#ffd9a0",
        emissive: "#ffb35c",
        emissiveIntensity: 0,
        roughness: 0.2,
      }),
    );
    glass.position.y = 0.12;
    const base = new Mesh(
      new CylinderGeometry(0.075, 0.08, 0.05, 16),
      new MeshStandardMaterial({ color: "#2b5e3a", roughness: 0.5 }),
    );
    base.position.y = 0.025;
    const top = new Mesh(new CylinderGeometry(0.03, 0.075, 0.04, 16), base.material);
    top.position.y = 0.21;
    this.lantern.position.set(0, 0.35, 0);
    this.lanternGroup.add(glass, base, top, this.lantern);
    this.lanternGroup.position.set(-2.1, this.gh(-2.1, 0.9), 0.9);
    this.lanternGroup.visible = false;
    this.lanternGroup.userData.glass = glass;
    this.scene.add(this.lanternGroup);
  }

  private buildGarden(): Group {
    const g = new Group();
    g.name = "garden";
    const rand = mulberry32(77);
    const rocks: [number, number, number][] = [
      [-3.2, -2.2, 0.9],
      [3.6, -1.6, 0.7],
      [2.6, 3.0, 0.5],
      [-4.6, 2.4, 0.6],
    ];
    const n = new ValueNoise(79);
    for (const [x, z, s] of rocks) {
      const geo = new IcosahedronGeometry(1, 3);
      const p = geo.attributes.position!;
      const colors: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const v = new Vector3(p.getX(i), p.getY(i), p.getZ(i));
        const k = 0.8 + n.fbm(v.x * 1.5 + x, v.y * 1.5 + v.z, 4) * 0.5;
        v.multiplyScalar(k);
        v.y *= 0.6;
        p.setXYZ(i, v.x, v.y, v.z);
        const moss = v.y > 0.2 ? Math.min(1, (v.y - 0.2) * 2) : 0;
        // Linear colors (sRGB ~0.55 gray, mossy green on top).
        colors.push(0.16 - moss * 0.1, 0.16 + moss * 0.02, 0.14 - moss * 0.1);
      }
      geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const rock = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      rock.scale.setScalar(s);
      rock.position.set(x, 0.1 * s, z);
      rock.rotation.y = rand() * 6;
      rock.castShadow = true;
      rock.receiveShadow = true;
      g.add(rock);
    }
    // One pair of chopsticks: "alguém daqui entrou de hashi".
    const lacquer = new MeshStandardMaterial({ color: "#7a1f1a", roughness: 0.3, metalness: 0.1 });
    for (let i = 0; i < 2; i++) {
      const stick = new Mesh(new CylinderGeometry(0.006, 0.012, 0.8, 8), lacquer);
      stick.position.set(1.65 + i * 0.05, 0.32, -1.25);
      stick.rotation.set(0.25, 0, -0.35 - i * 0.06);
      stick.castShadow = true;
      g.add(stick);
    }
    return g;
  }

  // ---------- state ----------

  setCameraMode(mode: CameraMode, instant = false): void {
    this.mode = mode;
    if (instant) {
      this.camPos.copy(CAMERAS[mode].pos);
      this.camLook.copy(CAMERAS[mode].look);
      this.camera.fov = CAMERAS[mode].fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get cameraMode(): CameraMode {
    return this.mode;
  }

  /** Sharp band on the hole: lower on the landing photo, centered when looking down. */
  focus(): number {
    return this.mode === "dig" ? 0.5 : 0.42;
  }

  setLighting(l: Lighting): void {
    const dist = 14;
    this.sun.position.set(
      Math.cos(l.azimuth) * Math.cos(Math.max(0.15, l.elevation)) * dist,
      Math.sin(Math.max(0.15, l.elevation)) * dist,
      -Math.sin(l.azimuth) * Math.cos(Math.max(0.15, l.elevation)) * dist * 0.6 + 4,
    );
    this.sun.intensity = l.sunIntensity;
    this.sun.color.set(l.sunColor);
    this.hemi.color.set(l.skyColor);
    this.hemi.groundColor.set(l.groundColor);
    this.hemi.intensity = l.hemiIntensity;
    const bg = this.scene.background as Color;
    bg.set(l.skyColor).multiplyScalar(0.75);
    (this.scene.fog as Fog).color.copy(bg);
    this.scene.environmentIntensity = 0.25 + 0.75 * l.day;
    this.lanternGroup.visible = l.lantern;
    this.lantern.intensity = l.lanternIntensity;
    const glass = this.lanternGroup.userData.glass as Mesh<BufferGeometry, MeshStandardMaterial>;
    glass.material.emissiveIntensity = l.lantern ? 2.5 : 0;
  }

  /** Tint the bottom of the shaft with the current layer, so you can see where the world is. */
  setLayer(index: number): void {
    const layer = LAYERS[index] ?? LAYERS[0]!;
    const c = new Color(layer.palette[1]).multiplyScalar(index >= 6 ? 0.9 : 0.12);
    (this.bottom.material as MeshBasicMaterial).color.copy(c);
  }

  /** Replace the spoons around the rim. Existing spoons keep their place; new ones appear. */
  setRim(slots: RimSlot[], spoonsById: Map<string, SpoonId>): void {
    const keep = new Set(slots.map((s) => s.id));
    for (const [id, planted] of this.spoons) {
      if (!keep.has(id)) {
        this.scene.remove(planted.outer);
        this.spoons.delete(id);
      }
    }
    for (const slot of slots) {
      const spoon = spoonsById.get(slot.id) ?? "teaspoon";
      const existing = this.spoons.get(slot.id);
      if (existing && existing.spoon === spoon) {
        existing.slot = slot;
        continue;
      }
      if (existing) this.scene.remove(existing.outer);
      const planted = this.plant(slot, spoon, false);
      this.spoons.set(slot.id, planted);
    }
  }

  private plant(slot: RimSlot, spoon: SpoonId, ghost: boolean): PlantedSpoon {
    const outer = new Group();
    const x = Math.cos(slot.angle) * slot.radius;
    const z = -Math.sin(slot.angle) * slot.radius;
    outer.position.set(x, this.gh(x, z) - 0.03, z);
    outer.rotation.order = "YXZ";
    outer.rotation.y = Math.atan2(x, z);
    outer.rotation.x = slot.tilt;
    const twist = new Group();
    twist.rotation.y = slot.twist;
    const model = buildSpoon(spoon, this.textureFactory);
    model.rotation.x = Math.PI / 2;
    model.position.y = SPOON_LENGTH * 0.9;
    model.scale.setScalar(1.6);
    model.traverse((o) => {
      o.castShadow = this.quality.shadows;
      if (ghost && o instanceof Mesh) {
        o.material = (o.material as MeshStandardMaterial).clone();
        (o.material as MeshStandardMaterial).transparent = true;
        (o.material as MeshStandardMaterial).opacity = 0;
      }
    });
    twist.add(model);
    outer.add(twist);
    this.scene.add(outer);
    return { slot, spoon, outer, twist, model, digT: 0, ghost, life: ghost ? 1.6 : Infinity };
  }

  /** World position for a rim tag (above the spoon's bowl). */
  tagAnchor(id: string, out: Vector3): Vector3 | null {
    const planted = this.spoons.get(id);
    if (!planted) return null;
    planted.model.updateWorldMatrix(true, false);
    out.set(0, 0, 0.12).applyMatrix4(planted.model.matrixWorld);
    out.y += 0.18;
    return out;
  }

  /** A spoon digs: lean into the hole and back, throw dirt. */
  dig(id: string): void {
    const planted = this.spoons.get(id);
    if (!planted) return;
    planted.digT = 1;
    this.puff(planted.outer.position, 6);
  }

  /** Your own scoop: the same, plus a small camera shake unless reduced motion is on. */
  digYou(id: string): void {
    this.dig(id);
    this.puff(new Vector3(0, -0.3, 0), 8);
    if (!this.reducedMotion) this.shakeT = 0.12;
  }

  /** Replay: a ghost spoon appears at a country's place and digs once. */
  ghostDig(angle: number): void {
    if (this.ghosts.length > 10) return;
    const slot: RimSlot = {
      id: `ghost${Math.random()}`,
      angle,
      radius: 2.0,
      tilt: 0.5,
      twist: angle * 3,
      you: false,
    };
    const g = this.plant(slot, "teaspoon", true);
    g.digT = 1;
    this.ghosts.push(g);
    this.puff(g.outer.position, 4);
  }

  private puff(at: Vector3, count: number): void {
    if (this.reducedMotion) return;
    const rand = Math.random;
    for (let i = 0; i < count && this.particles.length < 220; i++) {
      const dir = new Vector3(-at.x, 0, -at.z).normalize();
      this.particles.push({
        pos: new Vector3(at.x * 0.7, Math.max(at.y, 0) + 0.05, at.z * 0.7),
        vel: new Vector3(
          (rand() - 0.5) * 1.2 + dir.x * 0.6,
          1.2 + rand() * 1.6,
          (rand() - 0.5) * 1.2 + dir.z * 0.6,
        ),
        life: 0.9 + rand() * 0.4,
      });
    }
  }

  get spoonCount(): number {
    return this.spoons.size;
  }

  // ---------- frame ----------

  update(dt: number, time: number): void {
    const target = CAMERAS[this.mode];
    const k = 1 - Math.exp(-dt * 3);
    this.camPos.lerp(target.pos, k);
    this.camLook.lerp(target.look, k);
    if (Math.abs(this.camera.fov - target.fov) > 0.01) {
      this.camera.fov += (target.fov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.shake.set((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03);
      this.camera.position.x += this.shake.x;
      this.camera.position.z += this.shake.y;
    }
    // Gentle drift on the landing so the photo feels alive.
    if (this.mode !== "dig" && !this.reducedMotion) {
      this.camera.position.x += Math.sin(time * 0.12) * 0.15;
      this.camera.position.y += Math.sin(time * 0.09) * 0.05;
    }
    this.camera.lookAt(this.camLook);
    if (this.grassShader) this.grassShader.uniforms.uTime.value = this.reducedMotion ? 0 : time;

    const animate = (p: PlantedSpoon) => {
      if (p.digT > 0) {
        p.digT = Math.max(0, p.digT - dt * 3.2);
        const phase = Math.sin((1 - p.digT) * Math.PI);
        p.outer.rotation.x = p.slot.tilt - phase * 0.75;
      } else {
        p.outer.rotation.x = p.slot.tilt;
      }
    };
    for (const p of this.spoons.values()) animate(p);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]!;
      animate(g);
      g.life -= dt;
      const opacity = Math.min(1, Math.min(g.life, 1.6 - g.life) * 3) * 0.75;
      g.model.traverse((o) => {
        if (o instanceof Mesh) (o.material as MeshStandardMaterial).opacity = Math.max(0, opacity);
      });
      if (g.life <= 0) {
        this.scene.remove(g.outer);
        this.ghosts.splice(i, 1);
      }
    }

    // Dirt particles.
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.vel.y -= 9 * dt;
      p.pos.addScaledVector(p.vel, dt);
      const floor = this.gh(p.pos.x, p.pos.z);
      if (p.life <= 0 || p.pos.y < floor - 0.5) {
        this.particles.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.life * 7, p.life * 5, 0);
      this.dummy.scale.setScalar(0.6 + p.life * 0.6);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }
}
