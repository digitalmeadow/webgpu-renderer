import { Mat4 } from "../math/Mat4";
import { BaseCamera } from "./BaseCamera";

export interface OrthographicCameraDesc {
  size: number;    // full world-space height of view volume
  aspect: number;  // width / height
  near: number;
  far: number;
}

export const DEFAULT_ORTHOGRAPHIC_CAMERA_DESC: OrthographicCameraDesc = {
  size: 10,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};

export class OrthographicCamera extends BaseCamera {
  readonly cameraType = "orthographic" as const;
  private desc: OrthographicCameraDesc;

  get size(): number { return this.desc.size; }
  get aspect(): number { return this.desc.aspect; }
  get near(): number { return this.desc.near; }
  get far(): number { return this.desc.far; }

  constructor(device: GPUDevice, name?: string, desc?: Partial<OrthographicCameraDesc>) {
    super(device, name);
    this.desc = { ...DEFAULT_ORTHOGRAPHIC_CAMERA_DESC, ...desc };
  }

  updateDesc(partial: Partial<OrthographicCameraDesc>): void {
    this.desc = { ...this.desc, ...partial };
    this.projectionNeedsUpdate = true;
    this.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.updateDesc({ aspect: width / height });
  }

  protected updateProjection(): void {
    const halfH = this.desc.size / 2;
    const halfW = halfH * this.desc.aspect;
    Mat4.ortho(-halfW, halfW, -halfH, halfH, this.desc.near, this.desc.far, this.projectionMatrix);
  }
}
