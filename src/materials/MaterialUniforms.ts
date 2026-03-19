import { MaterialBase } from "./MaterialBase";
import { MaterialPBR } from "./MaterialPBR";

export class MaterialUniforms {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;
  private readonly data: Float32Array;

  constructor(device: GPUDevice, material: MaterialBase) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 32, // 8 floats: color (r,g,b,a) + opacity + padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `MaterialUniformsBuffer: ${material.name}`,
    });
    this.data = new Float32Array(8);
    this.update(material);
  }

  update(material: MaterialBase) {
    let color: [number, number, number, number] = [1, 1, 1, 1];

    if (material instanceof MaterialPBR) {
      color = material.baseColorFactor;
    } else if ("color" in material) {
      color = (material as any).color;
    }

    this.data[0] = color[0];
    this.data[1] = color[1];
    this.data[2] = color[2];
    this.data[3] = color[3];
    this.data[4] = material.opacity;
    this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer);
  }
}
