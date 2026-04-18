import { MaterialBase, MaterialType } from "./MaterialBase";

export class MaterialUniforms {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;
  private readonly data: Float32Array;

  constructor(device: GPUDevice, material: MaterialBase) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 64, // 16 floats: color (r,g,b,a) + opacity + emissive (r,g,b,a) + alpha_cutoff + use_dithering + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `MaterialUniformsBuffer: ${material.name}`,
    });
    this.data = new Float32Array(16);
    this.update(material);
  }

  update(material: MaterialBase) {
    let color: [number, number, number, number] = [1, 1, 1, 1];
    let emissive: [number, number, number] = [0, 0, 0];
    let emissiveIntensity = 0;
    let environmentTextureId = 0; // 0 = use global skybox by default

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
      // Get environment texture ID from material (will be set by MaterialManager)
      environmentTextureId = (material as any).environmentTextureId ?? 0;
    } else if ("color" in material) {
      color = (material as any).color;
    }

    this.data[0] = color[0];
    this.data[1] = color[1];
    this.data[2] = color[2];
    this.data[3] = color[3];
    this.data[4] = material.opacity;
    this.data[5] = environmentTextureId;
    this.data[6] = 0; // padding for vec4 alignment
    this.data[7] = 0; // padding for vec4 alignment
    this.data[8] = emissive[0];
    this.data[9] = emissive[1];
    this.data[10] = emissive[2];
    this.data[11] = emissiveIntensity;
    this.data[12] = material.alphaCutoff;
    this.data[13] = material.alphaMode === "dither" ? 1.0 : 0.0; // use_dithering flag
    this.data[14] = 0; // padding
    this.data[15] = 0; // padding

    this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer);
  }
}
