import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import type { CountryStat } from "../../shared/protocol";
import type { Quality } from "../core/quality";
import { HOLE_LAT_LON, countryLatLon, dotRadius, latLonToVector, project, unwrapRing } from "./geo";
import { ValueNoise, hexToRgb, lerpRgb, mulberry32 } from "./noise";
import type { View } from "./stage";
import { makeCanvas } from "./textures";

const MAX_DOTS = 200;

function earthCanvas(w: number): HTMLCanvasElement {
  const h = w / 2;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  // Ocean.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0d2238");
  grad.addColorStop(0.5, "#0f2c4a");
  grad.addColorStop(1, "#0d2238");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Land as a mask.
  const mask = makeCanvas(w, h);
  const m = mask.getContext("2d")!;
  m.fillStyle = "#fff";
  const topo = landTopo as unknown as Topology<{ land: GeometryCollection }>;
  const land = feature(topo, topo.objects.land) as unknown as {
    features: { geometry: { type: string; coordinates: unknown } }[];
  };
  for (const f of land.features) {
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates as [number, number][][]]
        : (f.geometry.coordinates as [number, number][][][]);
    for (const poly of polys) {
      for (const offset of [-360, 0, 360]) {
        m.beginPath();
        for (const ring of poly) {
          unwrapRing(ring).forEach(([lon, lat], i) => {
            const [x, y] = project(lon + offset, lat, w, h);
            if (i === 0) m.moveTo(x, y);
            else m.lineTo(x, y);
          });
          m.closePath();
        }
        m.fill("evenodd");
      }
    }
  }
  // Paint land with noise-tinted colors through the mask.
  const maskData = m.getImageData(0, 0, w, h).data;
  const img = ctx.getImageData(0, 0, w, h);
  const n = new ValueNoise(3);
  const greenA = hexToRgb("#3f5a2c");
  const greenB = hexToRgb("#7a7046");
  const desert = hexToRgb("#a58a5c");
  const ice = hexToRgb("#e6ebef");
  for (let y = 0; y < h; y++) {
    const lat = 90 - (y / h) * 180;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (maskData[i]! < 128) continue;
      const v = n.fbm(x / 40, y / 40, 4);
      let c = lerpRgb(greenA, greenB, v);
      const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 24) / 14) * n.fbm(x / 90 + 9, y / 90, 3);
      c = lerpRgb(c, desert, dry * 1.4);
      if (Math.abs(lat) > 62) c = lerpRgb(c, ice, Math.min(1, (Math.abs(lat) - 62) / 8));
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function cloudCanvas(w: number): HTMLCanvasElement {
  const h = w / 2;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const n = new ValueNoise(8);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = n.fbm((x / w) * 16, (y / h) * 8, 5, 16);
      const a = Math.max(0, v - 0.58) * 2.2;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** The Earth from space with a dot per country digging (board 4). Loaded on demand. */
export class GlobeScene implements View {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 16 / 9, 0.1, 100);
  private readonly earth = new Group();
  private readonly dots: InstancedMesh;
  private readonly dummy = new Object3D();
  private stats: CountryStat[] = [];
  private spin = 0;
  private drag: { x: number; y: number; spin: number; tilt: number } | null = null;
  private tilt = 0.25;
  private narrow = false;
  private userSpin = 0;
  private atmosphere: Mesh | null = null;

  constructor(quality: Quality) {
    this.scene.background = new Color("#05070a");
    const size = quality.name === "low" ? 1024 : 2048;
    const map = new CanvasTexture(earthCanvas(size));
    map.colorSpace = SRGBColorSpace;
    const sphere = new Mesh(
      new SphereGeometry(1, 96, 64),
      new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 }),
    );
    // Texture u=0 is lon -180; SphereGeometry u=0 starts at -X. Rotate so lon 0 faces +Z.
    sphere.rotation.y = -Math.PI / 2;
    this.earth.add(sphere);
    const clouds = new Mesh(
      new SphereGeometry(1.012, 64, 48),
      new MeshStandardMaterial({
        map: new CanvasTexture(cloudCanvas(size / 2)),
        transparent: true,
        depthWrite: false,
      }),
    );
    clouds.rotation.y = -Math.PI / 2 + 0.6;
    clouds.name = "clouds";
    this.earth.add(clouds);
    const atmosphere = new Mesh(
      new SphereGeometry(1.06, 64, 48),
      new ShaderMaterial({
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.0,0.0,1.0))), 4.0) * 1.6; gl_FragColor = vec4(0.35,0.6,1.0,1.0) * i; }`,
      }),
    );
    atmosphere.name = "atmosphere";
    this.atmosphere = atmosphere;
    this.scene.add(atmosphere);

    this.dots = new InstancedMesh(
      new SphereGeometry(1, 12, 8),
      new MeshBasicMaterial({ color: "#ff5a1f" }),
      MAX_DOTS,
    );
    this.dots.count = 0;
    this.earth.add(this.dots);

    const [hlat, hlon] = HOLE_LAT_LON;
    const ring = new Mesh(new RingGeometry(0.018, 0.026, 32), new MeshBasicMaterial({ color: "#f2f0ea" }));
    const hp = new Vector3(...latLonToVector(hlat, hlon, 1.003));
    ring.position.copy(hp);
    ring.lookAt(hp.clone().multiplyScalar(2));
    this.earth.add(ring);

    const sun = new DirectionalLight("#fff6e8", 3);
    sun.position.set(-3, 1.5, 4);
    this.scene.add(sun, new HemisphereLight("#9ab8ff", "#000000", 0.25), this.earth);

    // Stars.
    const rand = mulberry32(99);
    const starPos: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const v = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(40);
      starPos.push(v.x, v.y, v.z);
    }
    const sg = new BufferGeometry();
    sg.setAttribute("position", new Float32BufferAttribute(starPos, 3));
    this.scene.add(
      new Points(sg, new PointsMaterial({ color: "#c8d2e0", size: 0.06, sizeAttenuation: true })),
    );

    this.layout(16 / 9);
  }

  setCountries(stats: CountryStat[]): void {
    this.stats = stats.filter((s) => s.players > 0 && countryLatLon(s.code)).slice(0, MAX_DOTS);
    this.stats.forEach((s, i) => {
      const [lat, lon] = countryLatLon(s.code)!;
      this.dummy.position.set(...latLonToVector(lat, lon, 1.004));
      this.dummy.scale.setScalar(dotRadius(s.players));
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
    });
    this.dots.count = this.stats.length;
    this.dots.instanceMatrix.needsUpdate = true;
  }

  get dotCount(): number {
    return this.dots.count;
  }

  /** World position of a country's dot (for labels), or null. */
  countryPoint(code: string, out: Vector3): Vector3 | null {
    const ll = countryLatLon(code);
    if (!ll) return null;
    out.set(...latLonToVector(ll[0], ll[1], 1.02));
    this.earth.updateWorldMatrix(true, false);
    out.applyMatrix4(this.earth.matrixWorld);
    // Hidden behind the globe?
    const toCam = this.camera.position.clone().sub(out);
    return out.clone().sub(this.earth.position).normalize().dot(toCam.normalize()) > 0.1 ? out : null;
  }

  holePoint(out: Vector3): Vector3 {
    out.set(...latLonToVector(HOLE_LAT_LON[0], HOLE_LAT_LON[1], 1.02));
    this.earth.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.earth.matrixWorld);
  }

  pointerDown(x: number, y: number): void {
    this.drag = { x, y, spin: this.userSpin, tilt: this.tilt };
  }

  pointerMove(x: number, y: number): void {
    if (!this.drag) return;
    this.userSpin = this.drag.spin + (x - this.drag.x) * 0.006;
    this.tilt = Math.max(-0.9, Math.min(0.9, this.drag.tilt + (y - this.drag.y) * 0.004));
  }

  pointerUp(): void {
    this.drag = null;
  }

  private layout(aspect: number): void {
    this.narrow = aspect < 1;
    this.earth.position.set(this.narrow ? 0 : 0.55, this.narrow ? -0.25 : 0, 0);
    this.atmosphere?.position.copy(this.earth.position);
    this.camera.position.set(0, 0, this.narrow ? 5.6 : 4.2);
    this.camera.lookAt(this.narrow ? 0 : 0.2, this.narrow ? -0.1 : 0, 0);
  }

  resize(width: number, height: number): void {
    this.layout(width / height);
  }

  update(dt: number): void {
    if (!this.drag) this.spin += dt * 0.02;
    // Face South America (lon ≈ -55) by default.
    this.earth.rotation.set(this.tilt, (55 * Math.PI) / 180 + this.spin + this.userSpin, 0);
    const clouds = this.earth.getObjectByName("clouds");
    if (clouds) clouds.rotation.y += dt * 0.004;
  }
}
