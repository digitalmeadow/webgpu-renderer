import { Mat4 } from "../math";
import { Entity, EntityType } from "../scene/Entity";
import { CameraUniforms } from "./CameraUniforms";

export interface CameraDesc {
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

export const DEFAULT_CAMERA_DESC: CameraDesc = {
  fov: Math.PI / 4,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};

export class Camera extends Entity {
  readonly type = EntityType.Camera;
  readonly uniforms: CameraUniforms;

  private desc: CameraDesc;
  private viewMatrix: Mat4 = Mat4.create();
  private projectionMatrix: Mat4 = Mat4.create();
  private _viewProjectionMatrix: Mat4 = Mat4.create();

  get viewProjectionMatrix(): Mat4 {
    return this._viewProjectionMatrix;
  }

  // Desc field accessors — for read-only use by renderer internals
  get fov(): number {
    return this.desc.fov;
  }
  get aspect(): number {
    return this.desc.aspect;
  }
  get near(): number {
    return this.desc.near;
  }
  get far(): number {
    return this.desc.far;
  }

  constructor(device: GPUDevice, name?: string, desc?: Partial<CameraDesc>);
  constructor(device: GPUDevice, desc?: Partial<CameraDesc>);
  constructor(
    device: GPUDevice,
    nameOrDesc?: string | Partial<CameraDesc>,
    desc?: Partial<CameraDesc>,
  ) {
    const name = typeof nameOrDesc === "string" ? nameOrDesc : "Camera";
    const resolvedDesc = typeof nameOrDesc === "object" ? nameOrDesc : desc;

    super(name);
    this.desc = { ...DEFAULT_CAMERA_DESC, ...resolvedDesc };
    this.uniforms = new CameraUniforms(device);
    this.needsUpdate = true;
  }

  updateDesc(partial: Partial<CameraDesc>): void {
    this.desc = { ...this.desc, ...partial };
    this.uniforms.markProjectionDirty();
    this.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.updateDesc({ aspect: width / height });
  }

  update(): void {
    if (!this.needsUpdate && !this.transform.needsUpdate) return;

    this.transform.updateWorldMatrix();
    this.updateProjection();
    this.updateView();

    this.uniforms.update(
      this.viewMatrix,
      this.projectionMatrix,
      this._viewProjectionMatrix,
      this.transform.getWorldPosition(),
      this.desc.near,
      this.desc.far,
    );

    this.needsUpdate = false;
  }

  private updateProjection(): void {
    Mat4.perspective(
      this.desc.fov,
      this.desc.aspect,
      this.desc.near,
      this.desc.far,
      this.projectionMatrix,
    );
  }

  private updateView(): void {
    Mat4.invert(this.transform.worldMatrix, this.viewMatrix);
    Mat4.multiply(
      this.projectionMatrix,
      this.viewMatrix,
      this._viewProjectionMatrix,
    );
  }

  destroy(): void {
    this.uniforms.destroy();
  }
}
