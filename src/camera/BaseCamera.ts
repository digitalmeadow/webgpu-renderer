import { Mat4 } from "../math/Mat4";
import { Entity, EntityType } from "../scene/Entity";
import { CameraUniforms } from "./CameraUniforms";

export abstract class BaseCamera extends Entity {
  readonly type = EntityType.Camera;
  readonly uniforms: CameraUniforms;
  abstract readonly cameraType: "perspective" | "orthographic";

  protected viewMatrix: Mat4 = Mat4.create();
  protected projectionMatrix: Mat4 = Mat4.create();
  public viewProjectionMatrix: Mat4 = Mat4.create();
  protected projectionNeedsUpdate: boolean = true;

  abstract get near(): number;
  abstract get far(): number;
  abstract resize(width: number, height: number): void;
  protected abstract updateProjection(): void;

  constructor(device: GPUDevice, name?: string) {
    super(name);
    this.uniforms = new CameraUniforms(device);
    this.needsUpdate = true;
  }

  update(): void {
    if (!this.needsUpdate && !this.transform.needsUpdate) return;
    if (this.projectionNeedsUpdate) {
      this.updateProjection();
      this.projectionNeedsUpdate = false;
    }
    this.updateViewMatrices();
    this.uniforms.update(
      this.viewMatrix,
      this.projectionMatrix,
      this.viewProjectionMatrix,
      this.transform.getWorldPosition(),
      this.near,
      this.far,
    );
    this.needsUpdate = false;
  }

  private updateViewMatrices(): void {
    Mat4.invert(this.transform.worldMatrix, this.viewMatrix);
    Mat4.multiply(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);
  }

  destroy(): void {
    this.uniforms.destroy();
  }
}
