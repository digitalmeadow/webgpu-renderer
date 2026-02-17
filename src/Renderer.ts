import { World } from "./World";
import { Camera } from "./Camera";
import { Time } from "./Time";
import { GeometryBuffer } from "./GeometryBuffer";
import { GeometryPass } from "./GeometryPass";
import { OutputPass } from "./OutputPass";
import { Mesh } from "./Mesh";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private outputPass: OutputPass;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.device = null as unknown as GPUDevice;
    this.context = null as unknown as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.outputPass = null as unknown as OutputPass;
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

      this.geometryPass = new GeometryPass(this.device, this.geometryBuffer);
      this.outputPass = new OutputPass(this.device, this.geometryBuffer);
    } else {
      this.geometryBuffer.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );
    }
  }

  render(world: World, camera: Camera, time: Time): void {
    if (!this.device || !this.context || !this.geometryBuffer) {
      return;
    }

    world.update();
    camera.update(this.device);

    const meshes = this.collectMeshes(world);

    const commandEncoder = this.device.createCommandEncoder();

    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      meshes,
      camera,
    );

    const textureView = this.context.getCurrentTexture().createView();
    this.outputPass.render(commandEncoder, this.geometryBuffer, textureView);

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
}
