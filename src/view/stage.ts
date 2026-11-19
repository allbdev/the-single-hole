import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Quality } from "../core/quality";

/** Anything the stage can draw. */
export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  update(dt: number, time: number): void;
  resize?(width: number, height: number): void;
}

/** Owns the WebGL renderer and the canvas; draws whichever view is active. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private env: Texture | null = null;
  width = 1;
  height = 1;
  private readonly tmp = new Vector3();

  constructor(
    container: HTMLElement,
    private readonly quality: Quality,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute("aria-hidden", "true");
    container.appendChild(this.canvas);
    this.resize();
  }

  /** A soft studio environment for reflections on steel spoons. */
  environment(): Texture {
    if (!this.env) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    return this.env;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio));
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
  }

  render(view: View): void {
    const cam = view.camera;
    const aspect = this.width / this.height;
    if (Math.abs(cam.aspect - aspect) > 1e-4) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      view.resize?.(this.width, this.height);
    }
    this.renderer.render(view.scene, cam);
  }

  /** Project a world point to CSS pixels in the canvas. */
  project(point: Vector3, camera: Camera): { x: number; y: number; visible: boolean } {
    this.tmp.copy(point).project(camera);
    return {
      x: (this.tmp.x * 0.5 + 0.5) * this.width,
      y: (-this.tmp.y * 0.5 + 0.5) * this.height,
      visible: this.tmp.z < 1 && this.tmp.z > -1,
    };
  }

  /** Render a view and copy the frame (for the share card). */
  snapshot(view: View): HTMLCanvasElement {
    this.render(view);
    const out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    out.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return out;
  }

  dispose(): void {
    this.renderer.dispose();
    this.canvas.remove();
  }
}
