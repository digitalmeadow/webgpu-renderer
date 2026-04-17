import { Entity, EntityType } from "./Entity";
import { CubeRenderTarget } from "../textures/CubeRenderTarget";

export class ReflectionProbe extends Entity {
  readonly type = EntityType.ReflectionProbe;

  /**
   * Resolution of each cube face (e.g., 256 = 256x256 per face)
   */
  resolution: number = 256;

  /**
   * Near clipping plane for probe cameras
   */
  near: number = 0.1;

  /**
   * Far clipping plane for probe cameras
   */
  far: number = 100.0;

  /**
   * Update frequency in frames
   * 0 = every frame
   * N = every N frames
   */
  updateFrequency: number = 0;

  /**
   * The cube render target that holds the rendered environment
   */
  cubeRenderTarget: CubeRenderTarget | null = null;

  /**
   * Last frame number when this probe was updated
   */
  private lastUpdateFrame: number = -1;

  constructor(name: string = "ReflectionProbe") {
    super(name);
  }

  /**
   * Check if this probe should be updated this frame
   */
  shouldUpdate(currentFrame: number): boolean {
    // Always update on first frame
    if (this.lastUpdateFrame === -1) {
      return true;
    }

    // Update every frame if updateFrequency is 0
    if (this.updateFrequency === 0) {
      return true;
    }

    // Update every N frames
    return currentFrame - this.lastUpdateFrame >= this.updateFrequency;
  }

  /**
   * Mark this probe as updated for the given frame
   */
  markUpdated(frame: number): void {
    this.lastUpdateFrame = frame;
  }

  /**
   * Destroy GPU resources
   */
  destroy(): void {
    if (this.cubeRenderTarget) {
      this.cubeRenderTarget.destroy();
      this.cubeRenderTarget = null;
    }
  }
}
