import { Mat4, Vec3 } from "../math";
import { GpuFloats, byteSize, alignVec4 } from "../utils";

const OFFSET_VIEW_MATRIX = 0;
const OFFSET_PROJECTION_MATRIX = OFFSET_VIEW_MATRIX + GpuFloats.mat4;
const OFFSET_VIEW_PROJECTION_MATRIX = OFFSET_PROJECTION_MATRIX + GpuFloats.mat4;
const OFFSET_VIEW_INVERSE_MATRIX =
  OFFSET_VIEW_PROJECTION_MATRIX + GpuFloats.mat4;
const OFFSET_PROJECTION_INVERSE_MATRIX =
  OFFSET_VIEW_INVERSE_MATRIX + GpuFloats.mat4;
const OFFSET_POSITION = OFFSET_PROJECTION_INVERSE_MATRIX + GpuFloats.mat4;
const OFFSET_NEAR_FAR = OFFSET_POSITION + GpuFloats.vec4;

const FLOAT_COUNT = alignVec4(OFFSET_NEAR_FAR + GpuFloats.vec2); // pad to vec4 → 88 floats
const BUFFER_SIZE = byteSize(FLOAT_COUNT);

let _cameraBindGroupLayout: GPUBindGroupLayout | null = null;

export function createCameraBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  if (!_cameraBindGroupLayout) {
    _cameraBindGroupLayout = device.createBindGroupLayout({
      label: "Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
  }
  return _cameraBindGroupLayout;
}

export class CameraUniforms {
  private device: GPUDevice;
  readonly buffer: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
  readonly bindGroupLayout: GPUBindGroupLayout;

  private uniformData = new Float32Array(FLOAT_COUNT);
  private viewMatrixInverse: Mat4 = Mat4.create();
  private projectionMatrixInverse: Mat4 = Mat4.create();

  constructor(device: GPUDevice) {
    this.device = device;

    this.buffer = device.createBuffer({
      label: "Camera Uniforms Buffer",
      size: BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = createCameraBindGroupLayout(device);

    this.bindGroup = device.createBindGroup({
      label: "Camera Bind Group",
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
  }

  update(
    viewMatrix: Mat4,
    projectionMatrix: Mat4,
    viewProjectionMatrix: Mat4,
    position: Vec3,
    near: number,
    far: number,
  ): void {
    Mat4.invert(projectionMatrix, this.projectionMatrixInverse);
    Mat4.invert(viewMatrix, this.viewMatrixInverse);

    this.uniformData.set(viewMatrix.data, OFFSET_VIEW_MATRIX);
    this.uniformData.set(projectionMatrix.data, OFFSET_PROJECTION_MATRIX);
    this.uniformData.set(
      viewProjectionMatrix.data,
      OFFSET_VIEW_PROJECTION_MATRIX,
    );
    this.uniformData.set(
      this.viewMatrixInverse.data,
      OFFSET_VIEW_INVERSE_MATRIX,
    );
    this.uniformData.set(
      this.projectionMatrixInverse.data,
      OFFSET_PROJECTION_INVERSE_MATRIX,
    );

    this.uniformData[OFFSET_POSITION] = position.x;
    this.uniformData[OFFSET_POSITION + 1] = position.y;
    this.uniformData[OFFSET_POSITION + 2] = position.z;
    this.uniformData[OFFSET_POSITION + 3] = 1;

    this.uniformData[OFFSET_NEAR_FAR] = near;
    this.uniformData[OFFSET_NEAR_FAR + 1] = far;

    this.device.queue.writeBuffer(this.buffer, 0, this.uniformData);
  }

  destroy(): void {
    this.buffer.destroy();
  }
}
