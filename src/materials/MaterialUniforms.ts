import { GpuFloats, floatByteSize, alignVec4 } from "../utils";
import { MaterialType } from "./MaterialBase";
import type { MaterialPBR } from "./MaterialPBR";
import type { MaterialBasic } from "./MaterialBasic";
import type { MaterialCustom } from "./MaterialCustom";

const OFFSET_COLOR         = 0;
const OFFSET_OPACITY       = OFFSET_COLOR        + GpuFloats.vec4;  // 4
const OFFSET_ENV_ID        = OFFSET_OPACITY       + GpuFloats.f32;  // 5
// 2 padding floats to reach vec4 boundary
const OFFSET_EMISSIVE      = alignVec4(OFFSET_ENV_ID + GpuFloats.f32); // 8
const OFFSET_ALPHA_CUTOFF  = OFFSET_EMISSIVE      + GpuFloats.vec4;  // 12
const OFFSET_USE_DITHERING = OFFSET_ALPHA_CUTOFF  + GpuFloats.f32;  // 13
const FLOAT_COUNT          = alignVec4(OFFSET_USE_DITHERING + GpuFloats.f32); // 16
export const BUFFER_SIZE   = floatByteSize(FLOAT_COUNT); // 64

export class MaterialUniforms {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;
  private uniformData = new Float32Array(FLOAT_COUNT);

  constructor(device: GPUDevice, material: MaterialPBR | MaterialBasic | MaterialCustom) {
    this.device = device;
    this.buffer = device.createBuffer({
      label: `Material Uniforms Buffer: ${material.name}`,
      size: BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.update(material);
  }

  update(material: MaterialPBR | MaterialBasic | MaterialCustom): void {
    let color: [number, number, number, number] = [1, 1, 1, 1];
    let emissive: [number, number, number] = [0, 0, 0];
    let emissiveIntensity = 0.0;
    let environmentTextureId = 0;

    if (material.type === MaterialType.PBR) {
      color = material.baseColorFactor;
      emissive = material.emissiveFactor;
      emissiveIntensity = material.emissiveIntensity;
      environmentTextureId = material.environmentTextureId;
    } else if (material.type === MaterialType.Basic) {
      color = material.color;
    }

    this.uniformData[OFFSET_COLOR]         = color[0];
    this.uniformData[OFFSET_COLOR + 1]     = color[1];
    this.uniformData[OFFSET_COLOR + 2]     = color[2];
    this.uniformData[OFFSET_COLOR + 3]     = color[3];
    this.uniformData[OFFSET_OPACITY]       = material.opacity;
    this.uniformData[OFFSET_ENV_ID]        = environmentTextureId;
    // indices OFFSET_ENV_ID+1, +2 are padding — remain zero from initialization
    this.uniformData[OFFSET_EMISSIVE]      = emissive[0];
    this.uniformData[OFFSET_EMISSIVE + 1]  = emissive[1];
    this.uniformData[OFFSET_EMISSIVE + 2]  = emissive[2];
    this.uniformData[OFFSET_EMISSIVE + 3]  = emissiveIntensity;
    this.uniformData[OFFSET_ALPHA_CUTOFF]  = material.alphaCutoff;
    this.uniformData[OFFSET_USE_DITHERING] = material.alphaMode === "dither" ? 1.0 : 0.0;

    this.device.queue.writeBuffer(this.buffer, 0, this.uniformData);
  }
}
