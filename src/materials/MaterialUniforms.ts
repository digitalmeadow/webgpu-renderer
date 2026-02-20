import { MaterialBase } from "./MaterialBase";

export class MaterialUniforms {
  public readonly buffer: GPUBuffer;
  private readonly device: GPUDevice;
  private readonly data: Float32Array;

  constructor(device: GPUDevice, material: MaterialBase) {
    this.device = device;
    this.buffer = device.createBuffer({
      size: 16, // 1 float for opacity, padded to 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `MaterialUniformsBuffer: ${material.name}`,
    });
    this.data = new Float32Array(4); // 4 floats for padding
    this.update(material);
  }

  update(material: MaterialBase) {
    this.data[0] = material.opacity;
    this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer);
  }
}
