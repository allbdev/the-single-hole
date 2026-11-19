import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  PerspectiveCamera,
  Scene,
  type Camera,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";
import type { Quality } from "../core/quality";

/** Anything the stage can draw. */
export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  update(dt: number, time: number): void;
  resize?(width: number, height: number): void;
  /** Where the photo is sharp (0 = bottom, 1 = top of the screen), or null for no depth of field. */
  focus?(): number | null;
}

/** Tilt-shift depth of field: sharp band at the focus, softer towards the edges (art direction). */
class DepthOfField {
  readonly composer: EffectComposer;
  private readonly render: RenderPass;
  private readonly h: ShaderPass;
  private readonly v: ShaderPass;

  constructor(renderer: WebGLRenderer) {
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(new Scene(), new PerspectiveCamera());
    this.h = new ShaderPass(HorizontalTiltShiftShader);
    this.v = new ShaderPass(VerticalTiltShiftShader);
    this.composer.addPass(this.render);
    this.composer.addPass(this.h);
    this.composer.addPass(this.v);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number, ratio: number): void {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.h.uniforms.h!.value = 2.2 / (w * ratio);
    this.v.uniforms.v!.value = 2.2 / (h * ratio);
  }

  draw(scene: Scene, camera: PerspectiveCamera, focus: number): void {
    this.render.scene = scene;
    this.render.camera = camera;
    this.h.uniforms.r!.value = focus;
    this.v.uniforms.r!.value = focus;
    this.composer.render();
  }
}

/** Owns the WebGL renderer and the canvas; draws whichever view is active. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private env: Texture | null = null;
  private dof: DepthOfField | null = null;
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
    if (quality.depthOfField) this.dof = new DepthOfField(this.renderer);
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
    this.dof?.setSize(this.width, this.height, this.renderer.getPixelRatio());
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
    const focus = view.focus?.() ?? null;
    if (this.dof && focus !== null) this.dof.draw(view.scene, cam, focus);
    else this.renderer.render(view.scene, cam);
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
