export abstract class Uniforms {
  protected device: GPUDevice;
  public bindGroupLayout: GPUBindGroupLayout;
  public bindGroup: GPUBindGroup;

  constructor(device: GPUDevice) {
    this.device = device;
    this.bindGroupLayout = null as unknown as GPUBindGroupLayout;
    this.bindGroup = null as unknown as GPUBindGroup;
  }

  abstract update(...args: any[]): void;
}
