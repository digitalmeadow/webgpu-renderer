import { World } from "./World";
import { Camera } from "./Camera";
import { Time } from "./Time";
import { GeometryBuffer } from "./GeometryBuffer";
import { GeometryPass } from "./GeometryPass";
import { LightingPass } from "./LightingPass";
import { OutputPass } from "./OutputPass";
import { MaterialManager } from "./MaterialManager";
import { Mesh } from "./Mesh";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private outputPass: OutputPass;
  private materialManager: MaterialManager;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.device = null as unknown as GPUDevice;
    this.context = null as unknown as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.materialManager = null as unknown as MaterialManager;
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter found");
    }

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) {
      throw new Error("Could not get WebGPU context");
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    this.materialManager = new MaterialManager(this.device);

    const rect = this.canvas.getBoundingClientRect();
    this.resize(rect.width, rect.height);
  }

  resize(width: number, height: number): void {
    if (!this.device || !this.context) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);

    if (this.canvas.width === w && this.canvas.height === h) return;

    this.canvas.width = Math.max(
      1,
      Math.min(w, this.device.limits.maxTextureDimension2D),
    );
    this.canvas.height = Math.max(
      1,
      Math.min(h, this.device.limits.maxTextureDimension2D),
    );

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    if (!this.geometryBuffer) {
      this.geometryBuffer = new GeometryBuffer(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );

      this.geometryPass = new GeometryPass(
        this.device,
        this.geometryBuffer,
        this.materialManager,
      );

      this.lightingPass = new LightingPass(
        this.device,
        this.geometryBuffer,
        this.geometryPass.cameraBindGroupLayout,
        this.canvas.width,
        this.canvas.height,
      );

      this.outputPass = new OutputPass(this.device);
    } else {
      this.geometryBuffer.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );

      this.lightingPass.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );
    }
  }

  render(world: World, camera: Camera, time: Time): void {
    if (
      !this.device ||
      !this.context ||
      !this.geometryBuffer ||
      !this.geometryPass ||
      !this.lightingPass ||
      !this.outputPass
    ) {
      return;
    }

    world.update();
    camera.update(this.device);

    const meshes = this.collectMeshes(world);

    const commandEncoder = this.device.createCommandEncoder();

    // Geometry Pass
    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      meshes,
      camera,
      this.materialManager,
    );

    // Lighting Pass
    this.lightingPass.render(commandEncoder, this.geometryBuffer, camera);

    // Output Pass
    const swapChainView = this.context.getCurrentTexture().createView();
    this.outputPass.render(
      commandEncoder,
      this.lightingPass.outputView,
      swapChainView,
    );

    this.device.queue.submit([commandEncoder.finish()]);
  }

  private collectMeshes(world: World): Mesh[] {
    const meshes: Mesh[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity instanceof Mesh) {
          meshes.push(entity);
        }
      }
    }
    return meshes;
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getMaterialManager(): MaterialManager {
    return this.materialManager;
  }
}
