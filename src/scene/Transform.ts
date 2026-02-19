import { Mat4 } from "./math/mat4";
import { Vec3 } from "./math/vec3";
import { Quat } from "./math/quat";

export class Transform {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  localMatrix: Mat4;
  worldMatrix: Mat4;

  parent: Transform | null = null;
  children: Transform[] = [];

  constructor() {
    this.translation = Vec3.create();
    this.rotation = Quat.identity();
    this.scale = Vec3.create(1, 1, 1);
    this.localMatrix = Mat4.create();
    this.worldMatrix = Mat4.create();
    this.updateLocalMatrix();
  }

  setPosition(x: number, y: number, z: number): this {
    this.translation.set(x, y, z);
    this.updateLocalMatrix();
    return this;
  }

  setRotation(x: number, y: number, z: number): this {
    this.rotation = Quat.fromEuler(x, y, z);
    this.updateLocalMatrix();
    return this;
  }

  setRotationQuat(x: number, y: number, z: number, w: number): this {
    this.rotation.set(x, y, z, w);
    this.updateLocalMatrix();
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.scale.set(x, y, z);
    this.updateLocalMatrix();
    return this;
  }

  addChild(child: Transform): void {
    if (child.parent) {
      child.remove();
    }
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index !== -1) {
        this.parent.children.splice(index, 1);
      }
      this.parent = null;
    }
  }

  updateLocalMatrix(): void {
    Mat4.compose(this.translation, this.rotation, this.scale, this.localMatrix);
  }

  updateWorldMatrix(parentWorldMatrix?: Mat4): void {
    if (parentWorldMatrix) {
      Mat4.multiply(parentWorldMatrix, this.localMatrix, this.worldMatrix);
    } else {
      Mat4.copy(this.localMatrix, this.worldMatrix);
    }

    for (const child of this.children) {
      child.updateWorldMatrix(this.worldMatrix);
    }
  }

  public getForward(): Vec3 {
    const forward = new Vec3(0, 0, 1);
    Vec3.transformQuat(forward, this.rotation, forward);
    return forward;
  }

  getWorldMatrix(): Mat4 {
    return this.worldMatrix;
  }
}
