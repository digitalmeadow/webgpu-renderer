import type { GeometryBuffer } from "../GeometryBuffer";
import type { Camera } from "../../camera";
import type { Time } from "../../time";

/**
 * Interface for passes that write into the G-buffer after the main GeometryPass
 * but before the LightingPass. Implementing this allows external systems (e.g.
 * compute-driven grass, GPU particles) to contribute opaque geometry that
 * receives full deferred PBR lighting.
 *
 * Register with: renderer.addGBufferPass(pass)
 *
 * The render pass MUST use loadOp: "load" on all G-buffer attachments to
 * preserve geometry written by the main GeometryPass.
 */
export interface GBufferPass {
  render(
    encoder: GPUCommandEncoder,
    gBuffer: GeometryBuffer,
    camera: Camera,
    time: Time,
  ): void;
}
