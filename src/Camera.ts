import { Mat4 } from "./math/mat4";
import { Vec3 } from "./math/vec3";

const CAMERA_BUFFER_SIZE = 320;

export class CameraUniforms {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;

  constructor(device: GPUDevice) {
    this.buffer = device.createBuffer({
      label: "Camera Uniforms Buffer",
      size: CAMERA_BUFFER_SIZE,
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
      entries: [
        {
          binding: 0,
          resource: { buffer: this.buffer },
        },
      ],
    });
  }

  update(
    device: GPUDevice,
    viewMatrix: Mat4,
    projectionMatrix: Mat4,
    viewProjectionMatrix: Mat4,
    position: Vec3,
    near: number,
    far: number,
  ): void {
    const projectionMatrixInverse = Mat4.create();
    Mat4.invert(projectionMatrix, projectionMatrixInverse);

    const pos = new Float32Array([position.x, position.y, position.z, 1]);
    const nearFar = new Float32Array([near, far]);

    device.queue.writeBuffer(this.buffer, 0, viewMatrix.data as any);
    device.queue.writeBuffer(this.buffer, 64, projectionMatrix.data as any);
    device.queue.writeBuffer(
      this.buffer,
      128,
      viewProjectionMatrix.data as any,
    );
    device.queue.writeBuffer(
      this.buffer,
      192,
      projectionMatrixInverse.data as any,
    );
    device.queue.writeBuffer(this.buffer, 256, pos);
    device.queue.writeBuffer(this.buffer, 272, nearFar);
  }
}

export class Camera {
  uniforms: CameraUniforms;
  viewMatrix: Mat4;
  projectionMatrix: Mat4;
  viewProjectionMatrix: Mat4;

  fov: number;
  aspect: number;
  near: number;
  far: number;

  position: Vec3;
  target: Vec3;
  up: Vec3;

  constructor(
    device: GPUDevice,
    position: Vec3 = Vec3.create(0, 0, 5),
    target: Vec3 = Vec3.create(0, 0, 0),
    up: Vec3 = Vec3.create(0, 1, 0),
    fov: number = Math.PI / 4,
    aspect: number = 16 / 9,
    near: number = 0.1,
    far: number = 100,
  ) {
    this.uniforms = new CameraUniforms(device);

    this.position = position;
    this.target = target;
    this.up = up;

    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;

    this.viewMatrix = Mat4.create();
    this.projectionMatrix = Mat4.create();
    this.viewProjectionMatrix = Mat4.create();

    this.updateProjection();
    this.updateView();
  }

  update(device: GPUDevice): void {
    this.uniforms.update(
      device,
      this.viewMatrix,
      this.projectionMatrix,
      this.viewProjectionMatrix,
      this.position,
      this.near,
      this.far,
    );
  }

  updateProjection(): void {
    Mat4.perspective(
      this.fov,
      this.aspect,
      this.near,
      this.far,
      this.projectionMatrix,
    );
  }

  updateView(): void {
    Mat4.lookAt(this.position, this.target, this.up, this.viewMatrix);
    Mat4.multiply(
      this.projectionMatrix,
      this.viewMatrix,
      this.viewProjectionMatrix,
    );
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.updateProjection();
    this.updateView();
  }
}
