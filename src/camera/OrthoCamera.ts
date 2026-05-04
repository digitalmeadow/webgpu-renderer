import { Mat4 } from "../math";
import { Camera } from "./Camera";

export interface OrthoCameraDesc {
  size: number;
  aspect: number;
  near: number;
  far: number;
}

export const DEFAULT_ORTHO_CAMERA_DESC: OrthoCameraDesc = {
  size: 10,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};

export class OrthoCamera extends Camera {
  private desc: OrthoCameraDesc;

  get size(): number {
    return this.desc.size;
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
    desc?: Partial<OrthoCameraDesc>,
  ) {
    super(device, name);
    this.desc = { ...DEFAULT_ORTHO_CAMERA_DESC, ...desc };
    this.needsUpdate = true;
  }

  updateDesc(partial: Partial<OrthoCameraDesc>): void {
    this.desc = { ...this.desc, ...partial };
    this.projectionNeedsUpdate = true;
    this.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.updateDesc({ aspect: width / height });
  }

  updateProjection(): void {
    const halfWidth = (this.desc.size * this.desc.aspect) / 2;
    const halfHeight = this.desc.size / 2;
    Mat4.ortho(
      -halfWidth,
      halfWidth,
      -halfHeight,
      halfHeight,
      this.desc.near,
      this.desc.far,
      this.projectionMatrix,
    );
  }

  getFrustumHalfExtents(_distance: number): {
    halfWidth: number;
    halfHeight: number;
  } {
    return {
      halfWidth: (this.desc.size * this.desc.aspect) / 2,
      halfHeight: this.desc.size / 2,
    };
  }
}
