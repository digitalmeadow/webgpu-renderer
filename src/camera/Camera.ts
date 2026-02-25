import { mat4, vec3, Mat4, Vec3 } from 'wgpu-matrix';

const CAMERA_BUFFER_SIZE = 384;

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
    const projectionMatrixInverse = mat4.create();
    mat4.invert(projectionMatrix, projectionMatrixInverse);

    const viewMatrixInverse = mat4.create();
    mat4.invert(viewMatrix, viewMatrixInverse);

    const pos = new Float32Array([position[0], position[1], position[2], 1]);
    const nearFar = new Float32Array([near, far]);

    const viewMatrixF32 = new Float32Array(viewMatrix);
    const projectionMatrixF32 = new Float32Array(projectionMatrix);
    const viewProjectionMatrixF32 = new Float32Array(viewProjectionMatrix);
    const projectionMatrixInverseF32 = new Float32Array(projectionMatrixInverse);
    const viewMatrixInverseF32 = new Float32Array(viewMatrixInverse);

    device.queue.writeBuffer(this.buffer, 0, viewMatrixF32);
    device.queue.writeBuffer(this.buffer, 64, projectionMatrixF32);
    device.queue.writeBuffer(
      this.buffer,
      128,
      viewProjectionMatrixF32,
    );
    device.queue.writeBuffer(
      this.buffer,
      192,
      projectionMatrixInverseF32,
    );
    device.queue.writeBuffer(this.buffer, 256, viewMatrixInverseF32);
    device.queue.writeBuffer(this.buffer, 320, pos);
    device.queue.writeBuffer(this.buffer, 336, nearFar);
  }
}

let cameraIdCounter = 0;

export class Camera {
  public id: number;
  public uniforms: CameraUniforms;
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
    position?: Vec3,
    target?: Vec3,
    up?: Vec3,
    fov: number = Math.PI / 4,
    aspect: number = 16 / 9,
    near: number = 1.0,
    far: number = 100.0,
  ) {
    this.id = cameraIdCounter++;
    this.uniforms = new CameraUniforms(device);
    this.position = position ? vec3.fromValues(position[0], position[1], position[2]) : vec3.fromValues(0, 0, 5);
    this.target = target ? vec3.fromValues(target[0], target[1], target[2]) : vec3.fromValues(0, 0, 0);
    this.up = up ? vec3.fromValues(up[0], up[1], up[2]) : vec3.fromValues(0, 1, 0);

    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;

    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.viewProjectionMatrix = mat4.create();

    this.updateProjectionView();
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
    mat4.perspective(
      this.fov,
      this.aspect,
      this.near,
      this.far,
      this.projectionMatrix,
    );
  }

  updateView(): void {
    mat4.lookAt(this.position, this.target, this.up, this.viewMatrix);
    mat4.multiply(
      this.projectionMatrix,
      this.viewMatrix,
      this.viewProjectionMatrix,
    );
  }

  updateProjectionView(): void {
    this.updateProjection();
    this.updateView();
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.updateProjectionView();
  }
}
