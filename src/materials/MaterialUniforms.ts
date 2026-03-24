import { MaterialBase, MaterialType } from "./MaterialBase";
import { Texture } from "../textures";

export class MaterialUniforms {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;
  private readonly data: Float32Array;

  constructor(device: GPUDevice, material: MaterialBase) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 48, // 12 floats: color (r,g,b,a) + opacity + emissive (r,g,b) + intensity + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `MaterialUniformsBuffer: ${material.name}`,
    });
    this.data = new Float32Array(12);
    this.update(material);
  }

  update(material: MaterialBase) {
    let color: [number, number, number, number] = [1, 1, 1, 1];
    let emissive: [number, number, number] = [0, 0, 0];
    let emissiveIntensity = 0;

    if (material.type === MaterialType.PBR) {
      color = (material as any).baseColorFactor;
      const pbrEmissive = (material as any).emissiveFactor ?? [0, 0, 0];
      emissive = pbrEmissive;
      // Calculate intensity: max of RGB channels, or 0 if all zero
      emissiveIntensity = Math.max(
        pbrEmissive[0],
        pbrEmissive[1],
        pbrEmissive[2],
      );
    } else if ("color" in material) {
      color = (material as any).color;
    }

    this.data[0] = color[0];
    this.data[1] = color[1];
    this.data[2] = color[2];
    this.data[3] = color[3];
    this.data[4] = material.opacity;
    this.data[5] = 0; // padding
    this.data[6] = emissive[0];
    this.data[7] = emissive[1];
    this.data[8] = emissive[2];
    this.data[9] = emissiveIntensity;
    this.data[10] = 0; // padding
    this.data[11] = 0; // padding
    this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer);
  }
}
