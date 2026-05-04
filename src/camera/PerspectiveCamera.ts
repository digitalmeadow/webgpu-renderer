import { Mat4 } from "../math";
import { Camera } from "./Camera";

export interface PerspectiveCameraDesc {
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

export const DEFAULT_PERSPECTIVE_CAMERA_DESC: PerspectiveCameraDesc = {
  fov: Math.PI / 4,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};

export class PerspectiveCamera extends Camera {
  private desc: PerspectiveCameraDesc;

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

  constructor(
    device: GPUDevice,
    name?: string,
    desc?: Partial<PerspectiveCameraDesc>,
  ) {
    super(device, name);
    this.desc = { ...DEFAULT_PERSPECTIVE_CAMERA_DESC, ...desc };
    this.needsUpdate = true;
  }

  updateDesc(partial: Partial<PerspectiveCameraDesc>): void {
    this.desc = { ...this.desc, ...partial };
    this.projectionNeedsUpdate = true;
    this.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.updateDesc({ aspect: width / height });
  }

  updateProjection(): void {
    Mat4.perspective(
      this.desc.fov,
      this.desc.aspect,
      this.desc.near,
      this.desc.far,
      this.projectionMatrix,
    );
  }

  getFrustumHalfExtents(distance: number): {
    halfWidth: number;
    halfHeight: number;
  } {
    const halfHeight = distance * Math.tan(this.desc.fov / 2);
    return { halfWidth: halfHeight * this.desc.aspect, halfHeight };
  }
}
