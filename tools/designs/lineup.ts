/**
 * Dev-only page for the design canvas: renders the game's own models in a row.
 *   /tools/designs/lineup.html?what=spoons   eight spoons on slate (Spoons board)
 *   /tools/designs/lineup.html?what=cores    eight core samples in a core box (Layers board)
 * Used by tools/designs/render-boards.ts; sets window.__ready when drawn.
 */
import {
  ACESFilmicToneMapping,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LAYERS } from "../../shared/data/layers";
import { SPOONS } from "../../shared/data/spoons";
import { coreSampleCanvas } from "../../src/view/core-sample";
import { ValueNoise } from "../../src/view/noise";
import { buildSpoon } from "../../src/view/spoon-model";
import { brushedCanvas, makeCanvas, speckleCanvas, toTexture, woodCanvas } from "../../src/view/textures";

const what = new URLSearchParams(location.search).get("what") ?? "spoons";
const W = 1664;
const H = what === "spoons" ? 700 : 760;

function done(): void {
  (window as unknown as { __ready: boolean }).__ready = true;
}

if (what === "spoons") {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  document.body.append(renderer.domElement);
  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // Slate.
  const slateCanvas = makeCanvas(512, 512);
  const ctx = slateCanvas.getContext("2d")!;
  const n = new ValueNoise(9);
  const img = ctx.createImageData(512, 512);
  for (let i = 0; i < 512 * 512; i++) {
    const v = 28 + n.fbm((i % 512) / 40, Math.floor(i / 512) / 40, 4) * 26;
    img.data.set([v, v + 2, v + 4, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const slate = new Mesh(new PlaneGeometry(20, 10), new MeshStandardMaterial({ map: toTexture(slateCanvas, 1), roughness: 0.9 }));
  slate.rotation.x = -Math.PI / 2;
  scene.add(slate);
  const textures = (kind: "wood" | "speckle" | "brushed" | "tarnish", color: string) =>
    kind === "wood"
      ? toTexture(woodCanvas(256))
      : kind === "speckle"
        ? toTexture(speckleCanvas(256, color))
        : toTexture(brushedCanvas(256, kind === "tarnish"), 1, false);
  SPOONS.forEach((s, i) => {
    const spoon = buildSpoon(s.id, textures);
    spoon.scale.setScalar(1.6);
    spoon.position.set((i - 3.5) * 1.05, 0.02, -0.75);
    spoon.rotation.y = 0;
    scene.add(spoon);
  });
  const key = new DirectionalLight("#fff4e2", 2.2);
  key.position.set(-3, 6, 4);
  scene.add(key, new HemisphereLight("#dfe8f2", "#202020", 0.5));
  const camera = new PerspectiveCamera(24, W / H, 0.1, 100);
  camera.position.set(0, 8.2, 3.2);
  camera.lookAt(0, 0, 0.05);
  renderer.render(scene, camera);
  done();
} else {
  // Core box: wood frame, eight compartments, one core each.
  const canvas = makeCanvas(W, H);
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const wood = woodCanvas(256);
  const pattern = ctx.createPattern(wood, "repeat")!;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, W, H);
  const pad = 42;
  const cell = (W - pad * 2) / LAYERS.length;
  LAYERS.forEach((_, i) => {
    const x = pad + i * cell;
    ctx.fillStyle = "rgba(20,12,6,0.85)";
    ctx.fillRect(x + 10, pad, cell - 20, H - pad * 2);
    const core = coreSampleCanvas(i, Math.round(cell - 60), H - pad * 2 - 60);
    ctx.drawImage(core, x + 30, pad + 30);
  });
  done();
}
