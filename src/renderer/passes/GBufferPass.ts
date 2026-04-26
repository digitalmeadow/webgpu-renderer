import type { Camera } from "../../camera";
import type { Time } from "../../time";

/**
 * Contributes opaque geometry to the G-buffer in the same render pass as
 * GeometryPass (no extra render pass boundaries). Register with:
 * renderer.addGBufferPass(pass)
 */
export interface GBufferPass {
  render(passEncoder: GPURenderPassEncoder, camera: Camera, time: Time): void;
  destroy(): void;
}
