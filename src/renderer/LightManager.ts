import { Light, DirectionalLight } from "../lights";

// This will be expanded to support more lights
const MAX_LIGHTS = 1;

// Matching the WGSL struct
const LIGHT_SIZE = 48; // In bytes

export class LightManager {
  private device: GPUDevice;
  public lightBuffer: GPUBuffer;
  public uniformsBuffer: GPUBuffer;
  public lightBindGroupLayout: GPUBindGroupLayout;
  public lightBindGroup: GPUBindGroup;

  constructor(device: GPUDevice) {
    this.device = device;

    this.lightBuffer = this.device.createBuffer({
      size: MAX_LIGHTS * LIGHT_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Alias for convenience
    this.uniformsBuffer = this.lightBuffer;

    this.lightBindGroupLayout = this.device.createBindGroupLayout({
      label: "Light Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.lightBindGroup = this.device.createBindGroup({
      label: "Light Bind Group",
      layout: this.lightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.lightBuffer,
          },
        },
      ],
    });
  }

  update(lights: Light[]) {
    // For now, we only support one directional light
    const directionalLights = lights.filter(
      (l) => l instanceof DirectionalLight,
    ) as DirectionalLight[];
    if (directionalLights.length > 0) {
      const light = directionalLights[0];
      const lightData = new Float32Array(MAX_LIGHTS * (LIGHT_SIZE / 4));
      const u32Data = new Uint32Array(lightData.buffer);

      // vec4 color
      lightData.set(light.color.data, 0);

      // vec4 direction
      lightData.set(light.transform.getForward().data, 4);

      // f32 intensity
      lightData[8] = light.intensity;

      // u32 light_type
      u32Data[9] = light.type;

      this.device.queue.writeBuffer(this.lightBuffer, 0, lightData);
    }
  }
}
