import {
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Texture,
} from "three";
import { LAYERS } from "../../shared/data/layers";
import { SECTION_SLABS, sectionDepthFraction, slabTops } from "../core/layout";
import type { Quality } from "../core/quality";
import { mulberry32 } from "./noise";
import { HoleScene } from "./hole-scene";
import type { View } from "./stage";
import { layerCanvas, layerEmissiveCanvas, toTexture } from "./textures";

export const BLOCK = { width: 5.6, height: 7.6, depth: 3.4 };
const SLAB_TOTAL = SECTION_SLABS.reduce((a, b) => a + b, 0);

/** The cut block of ground with the eight layers and the thin shaft (board 3). */
export class SectionScene implements View {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 16 / 9, 0.1, 100);
  private readonly block = new Group();
  private readonly shaft: Mesh;
  private readonly holeTop: Mesh;
  private depthFraction = 0;
  private pointerX = 0;
  private pointerY = 0;
  private narrow = false;
  readonly markerPoint = new Vector3();

  constructor(quality: Quality, environment: Texture | null) {
    this.scene.background = new Color("#0c0e10");
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.3;
    const sun = new DirectionalLight("#fff4e2", 2.2);
    sun.position.set(-4, 9, 7);
    this.scene.add(sun, new HemisphereLight("#d8e2ee", "#1b140e", 0.9));

    const tops = slabTops();
    const size = quality.name === "low" ? 256 : 512;
    LAYERS.forEach((_, i) => {
      const h = (SECTION_SLABS[i]! / SLAB_TOTAL) * BLOCK.height;
      const y = BLOCK.height / 2 - tops[i]! * BLOCK.height - h / 2;
      const map = toTexture(layerCanvas(i, size));
      map.repeat.set(BLOCK.width / 2.4, h / 2.4);
      const sideMap = map.clone();
      sideMap.repeat.set(BLOCK.depth / 2.4, h / 2.4);
      sideMap.needsUpdate = true;
      const emissiveCanvas = layerEmissiveCanvas(i, size);
      const make = (m: Texture) => {
        const mat = new MeshStandardMaterial({ map: m, roughness: 0.92, metalness: 0 });
        if (emissiveCanvas) {
          const e = toTexture(emissiveCanvas);
          e.repeat.copy(m.repeat);
          mat.emissiveMap = e;
          mat.emissive = new Color("#ffffff");
          mat.emissiveIntensity = LAYERS[i]!.id === "core" ? 0.55 : 1.6;
        }
        return mat;
      };
      const front = make(map);
      const side = make(sideMap);
      const dark = new MeshStandardMaterial({ color: "#141210", roughness: 1 });
      // Box face order: +x, -x, +y, -y, +z, -z.
      const slab = new Mesh(new BoxGeometry(BLOCK.width, h, BLOCK.depth), [
        side,
        dark,
        dark,
        dark,
        front,
        dark,
      ]);
      slab.position.y = y;
      slab.name = `slab-${LAYERS[i]!.id}`;
      this.block.add(slab);
    });

    // Grass on top.
    const top = new Mesh(
      new BoxGeometry(BLOCK.width, 0.06, BLOCK.depth),
      new MeshStandardMaterial({ color: "#3d5a24", roughness: 1 }),
    );
    top.position.y = BLOCK.height / 2 + 0.03;
    this.block.add(top);
    const blades = quality.name === "low" ? 2500 : 7000;
    const grass = new InstancedMesh(
      HoleScene.bladeGeometry(),
      new MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: DoubleSide }),
      blades,
    );
    const dummy = new Object3D();
    const rand = mulberry32(91);
    const c = new Color();
    for (let i = 0; i < blades; i++) {
      dummy.position.set(
        (rand() - 0.5) * BLOCK.width * 0.99,
        BLOCK.height / 2 + 0.05,
        (rand() - 0.5) * BLOCK.depth * 0.99,
      );
      dummy.rotation.set((rand() - 0.5) * 0.4, rand() * 6.3, (rand() - 0.5) * 0.4);
      dummy.scale.set(1.4, 0.14 + rand() * 0.12, 1);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      c.setHSL(0.24, 0.45, 0.22 + rand() * 0.14);
      grass.setColorAt(i, c);
    }
    this.block.add(grass);

    // The shaft: a thin dark cut on the front face, from the grass down to the bottom of the hole.
    this.shaft = new Mesh(new BoxGeometry(0.11, 1, 0.02), new MeshBasicMaterial({ color: "#050505" }));
    this.shaft.position.set(-BLOCK.width * 0.08, 0, BLOCK.depth / 2 + 0.011);
    this.block.add(this.shaft);
    this.holeTop = new Mesh(new BoxGeometry(0.12, 0.02, 0.12), new MeshBasicMaterial({ color: "#050505" }));
    this.holeTop.position.set(this.shaft.position.x, BLOCK.height / 2 + 0.065, BLOCK.depth / 2 - 0.06);
    this.block.add(this.holeTop);

    this.block.rotation.y = -0.42;
    this.block.rotation.x = 0.06;
    this.scene.add(this.block);
    this.layout(16 / 9);
    this.setDepth(0);
  }

  /** Bottom of the hole in meters. */
  setDepth(meters: number): void {
    this.depthFraction = sectionDepthFraction(meters);
    const len = Math.max(0.02, this.depthFraction * BLOCK.height);
    this.shaft.scale.y = len;
    this.shaft.position.y = BLOCK.height / 2 - len / 2;
  }

  get fraction(): number {
    return this.depthFraction;
  }

  /** World point at the bottom of the shaft, for the "ESTAMOS AQUI" tag. */
  marker(out: Vector3): Vector3 {
    out.set(this.shaft.position.x, BLOCK.height / 2 - this.depthFraction * BLOCK.height, BLOCK.depth / 2);
    this.block.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.block.matrixWorld);
  }

  /** World point at the top-front-left corner of slab i, for the layer labels. */
  slabCorner(i: number, out: Vector3): Vector3 {
    const top = slabTops()[i] ?? 0;
    out.set(-BLOCK.width / 2, BLOCK.height / 2 - top * BLOCK.height, BLOCK.depth / 2);
    this.block.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.block.matrixWorld);
  }

  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  private layout(aspect: number): void {
    this.narrow = aspect < 1;
    if (this.narrow) {
      // Phone: block fills the width, labels drop.
      this.block.position.set(0, -0.4, 0);
      this.camera.position.set(0.6, 1.2, 15.5);
      this.camera.fov = 44;
    } else {
      this.block.position.set(1.4, -0.35, 0);
      this.camera.position.set(0.5, 2.6, 16.5);
      this.camera.fov = 34;
    }
    this.camera.updateProjectionMatrix();
  }

  get isNarrow(): boolean {
    return this.narrow;
  }

  resize(width: number, height: number): void {
    this.layout(width / height);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 2);
    this.block.rotation.y += (-0.42 + this.pointerX * 0.12 - this.block.rotation.y) * k;
    this.block.rotation.x += (0.06 + this.pointerY * 0.05 - this.block.rotation.x) * k;
    this.camera.lookAt(this.block.position.x * 0.55, this.narrow ? -0.6 : -0.2, 0);
  }
}
