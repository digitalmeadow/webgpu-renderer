import { Mat4 } from "../math";
import { BaseCamera } from "./BaseCamera";

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

export class Camera extends BaseCamera {
  readonly cameraType = "perspective" as const;

  private desc: CameraDesc;

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

  constructor(device: GPUDevice, name?: string, desc?: Partial<CameraDesc>) {
    super(device, name);
    this.desc = { ...DEFAULT_CAMERA_DESC, ...desc };
  }

  updateDesc(partial: Partial<CameraDesc>): void {
    this.desc = { ...this.desc, ...partial };
    this.projectionNeedsUpdate = true;
    this.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.updateDesc({ aspect: width / height });
  }

  protected updateProjection(): void {
    Mat4.perspective(
      this.desc.fov,
      this.desc.aspect,
      this.desc.near,
      this.desc.far,
      this.projectionMatrix,
    );
  }
}
