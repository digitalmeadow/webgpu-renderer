import { GeometryBuffer } from "../GeometryBuffer";

export interface PostPassContext {
  geometryBuffer: GeometryBuffer;
  cameraBindGroup: GPUBindGroup;
  lightingBindGroup: GPUBindGroup;
  sceneBindGroup: GPUBindGroup;
  width: number;
  height: number;
}

export abstract class PostPass {
  abstract render(
    input: GPUTextureView,
    output: GPUTextureView,
    context: PostPassContext,
  ): void;

  resize(width: number, height: number): void {
    // Override in subclass if needed
  }
}
