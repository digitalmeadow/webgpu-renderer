import { GeometryBuffer } from "../GeometryBuffer";

export interface PostPassContext {
  geometryBuffer: GeometryBuffer;
  cameraBindGroup: GPUBindGroup;
  lightingBindGroup: GPUBindGroup;
  sceneBindGroup: GPUBindGroup;
  width: number;
  height: number;
  occlusionView?: GPUTextureView;
}

export abstract class PostPass {
  abstract render(
    encoder: GPUCommandEncoder,
    input: GPUTextureView,
    output: GPUTextureView,
    context: PostPassContext,
  ): void;

  resize(width: number, height: number): void {
    // Override in subclass if needed
  }
}
