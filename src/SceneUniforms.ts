import { Vec3 } from "./math";
import { Uniforms } from "./Uniforms";

export class SceneUniforms extends Uniforms {
  private _ambientLightColor: Vec3;
  private _buffer: GPUBuffer;

  constructor(
    device: GPUDevice,
    ambientLightColor: Vec3 = new Vec3(0.05, 0.05, 0.05),
  ) {
    super(device);
    this._ambientLightColor = ambientLightColor;

    this._buffer = this.device.createBuffer({
      label: "Scene Uniforms Buffer",
      size: 16, // vec3<f32> is 12 bytes, padded to 16
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: "Scene Uniforms Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this._buffer,
          },
        },
      ],
    });

    this.update();
  }

  update(): void {
    this.device.queue.writeBuffer(
      this._buffer,
      0,
      new Float32Array(this._ambientLightColor.data),
    );
  }

  get ambientLightColor(): Vec3 {
    return this._ambientLightColor;
  }

  set ambientLightColor(value: Vec3) {
    this._ambientLightColor = value;
  }
}
