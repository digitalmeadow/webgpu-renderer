import { Mat4, Vec3 } from "../math";

// Buffer layout (column-major, std140-compatible):
//   view                mat4   64b   offset 0
//   projection          mat4   64b   offset 64
//   viewProjection      mat4   64b   offset 128
//   viewInverse         mat4   64b   offset 192
//   projectionInverse   mat4   64b   offset 256
//   position            vec4   16b   offset 320
//   nearFar             vec2    8b   offset 336
//   padding                     8b   offset 344
//   total                      352b
const MAT4_F = 16; // floats per mat4
const VEC4_F = 4;
const VEC2_F = 2;
const PAD_F = 2;
const TOTAL_F = MAT4_F * 5 + VEC4_F + VEC2_F + PAD_F; // 88 floats = 352 bytes

// Float-index offsets for staging buffer writes
const F_VIEW = 0;
const F_PROJECTION = MAT4_F;
const F_VIEW_PROJ = MAT4_F * 2;
const F_VIEW_INV = MAT4_F * 3;
const F_PROJ_INV = MAT4_F * 4;
const F_POSITION = MAT4_F * 5;
const F_NEAR_FAR = F_POSITION + VEC4_F;

const BUFFER_SIZE = TOTAL_F * Float32Array.BYTES_PER_ELEMENT; // 352

export class CameraUniforms {
  private device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
  readonly bindGroupLayout: GPUBindGroupLayout;

  // Pre-allocated — avoids per-frame heap allocations
  private stagingData = new Float32Array(TOTAL_F);
  private viewMatrixInverse: Mat4 = Mat4.create();
  private projectionMatrixInverse: Mat4 = Mat4.create();
  private projectionDirty: boolean = true;

  constructor(device: GPUDevice) {
    this.device = device;

    this.buffer = device.createBuffer({
      label: "Camera Uniforms Buffer",
      size: BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "Camera Bind Group",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
  }

  markProjectionDirty(): void {
    this.projectionDirty = true;
  }

  update(
    viewMatrix: Mat4,
    projectionMatrix: Mat4,
    viewProjectionMatrix: Mat4,
    position: Vec3,
    near: number,
    far: number,
  ): void {
    const d = this.stagingData;

    if (this.projectionDirty) {
      Mat4.invert(projectionMatrix, this.projectionMatrixInverse);
      this.projectionDirty = false;
    }

    Mat4.invert(viewMatrix, this.viewMatrixInverse);

    d.set(viewMatrix.data, F_VIEW);
    d.set(projectionMatrix.data, F_PROJECTION);
    d.set(viewProjectionMatrix.data, F_VIEW_PROJ);
    d.set(this.viewMatrixInverse.data, F_VIEW_INV);
    d.set(this.projectionMatrixInverse.data, F_PROJ_INV);

    d[F_POSITION] = position.x;
    d[F_POSITION + 1] = position.y;
    d[F_POSITION + 2] = position.z;
    d[F_POSITION + 3] = 1;

    d[F_NEAR_FAR] = near;
    d[F_NEAR_FAR + 1] = far;

    this.device.queue.writeBuffer(this.buffer, 0, d.buffer as ArrayBuffer);
  }

  destroy(): void {
    this.buffer.destroy();
  }
}
