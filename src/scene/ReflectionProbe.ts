import { Entity, EntityType } from "./Entity";
import { CubeRenderTarget } from "../textures/CubeRenderTarget";

const DEFAULT_PROBE_RESOLUTION = 256;

export class ReflectionProbe extends Entity {
  readonly type = EntityType.ReflectionProbe;

  resolution: number = DEFAULT_PROBE_RESOLUTION;
  near: number = 0.1;
  far: number = 100.0;
  // 1 = every frame, N = every N frames
  updateFrequency: number = 1;
  cubeRenderTarget: CubeRenderTarget | null = null;

  private lastUpdateFrame: number = Number.NEGATIVE_INFINITY;

  constructor(name: string = "ReflectionProbe") {
    super(name);
  }

  shouldUpdate(currentFrame: number): boolean {
    return currentFrame - this.lastUpdateFrame >= this.updateFrequency;
  }

  markUpdated(frame: number): void {
    this.lastUpdateFrame = frame;
  }

  destroy(): void {
    if (this.cubeRenderTarget) {
      this.cubeRenderTarget.destroy();
      this.cubeRenderTarget = null;
    }
  }
}
