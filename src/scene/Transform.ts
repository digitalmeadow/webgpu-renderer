import { Vec3, Quat, Mat4 } from "../math";

export class Transform {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  localMatrix: Mat4;
  worldMatrix: Mat4;
  needsUpdate: boolean = true;
  private _worldMatrixVersion: number = 0;

  parent: Transform | null = null;
  children: Transform[] = [];

  constructor() {
    this.translation = Vec3.create();
    this.rotation = Quat.create();
    this.scale = Vec3.create(1, 1, 1);
    this.localMatrix = Mat4.create();
    this.worldMatrix = Mat4.create();
    this.updateLocalMatrix();
  }

  setPosition(x: number, y: number, z: number): this {
    this.translation.set(x, y, z);
    this.updateLocalMatrix();
    this.markNeedsUpdate();
    return this;
  }

  setRotation(x: number, y: number, z: number): this {
    Quat.fromEuler(x, y, z, this.rotation);
    this.updateLocalMatrix();
    this.markNeedsUpdate();
    return this;
  }

  setRotationQuat(x: number, y: number, z: number, w: number): this {
    this.rotation.set(x, y, z, w);
    this.updateLocalMatrix();
    this.markNeedsUpdate();
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.scale.set(x, y, z);
    this.updateLocalMatrix();
    this.markNeedsUpdate();
    return this;
  }

  markNeedsUpdate(): void {
    this.needsUpdate = true;
    // parent change invalidates descendants
    for (const child of this.children) {
      child.markNeedsUpdate();
    }
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

  private updateLocalMatrix(): void {
    Mat4.compose(this.translation, this.rotation, this.scale, this.localMatrix);
  }

  updateWorldMatrix(parentWorldMatrix?: Mat4): void {
    if (this.needsUpdate) {
      if (parentWorldMatrix) {
        Mat4.multiply(parentWorldMatrix, this.localMatrix, this.worldMatrix);
      } else {
        Mat4.copy(this.localMatrix, this.worldMatrix);
      }
      this.needsUpdate = false;
      this._worldMatrixVersion++;
    }

    for (const child of this.children) {
      child.updateWorldMatrix(this.worldMatrix);
    }
  }

  get worldMatrixVersion(): number {
    return this._worldMatrixVersion;
  }

  getForward(out?: Vec3): Vec3 {
    const forward = Vec3.create(0, 0, 1);
    return Vec3.transformQuat(forward, this.rotation, out ?? forward);
  }

  lookAt(target: Vec3, upHint?: Vec3): this {
    const dir = Vec3.sub(target, this.translation);
    Vec3.normalize(dir, dir);

    let up =
      upHint ??
      (Math.abs(dir.y) > 0.9999 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0));

    // up × dir = right; dir × right = corrected up
    const right = Vec3.cross(up, dir);
    Vec3.normalize(right, right);
    const newUp = Vec3.cross(dir, right);

    const rotMatrix = Mat4.create();
    rotMatrix.data[0] = right.x;
    rotMatrix.data[1] = right.y;
    rotMatrix.data[2] = right.z;
    rotMatrix.data[4] = newUp.x;
    rotMatrix.data[5] = newUp.y;
    rotMatrix.data[6] = newUp.z;
    rotMatrix.data[8] = dir.x;
    rotMatrix.data[9] = dir.y;
    rotMatrix.data[10] = dir.z;

    Mat4.getRotation(rotMatrix, this.rotation);
    this.updateLocalMatrix();
    this.markNeedsUpdate();
    return this;
  }

  getWorldPosition(out?: Vec3): Vec3 {
    return Mat4.getTranslation(this.worldMatrix, out);
  }

  getWorldRotation(out?: Quat): Quat {
    return Mat4.getRotation(this.worldMatrix, out);
  }

  getWorldForward(out?: Vec3): Vec3 {
    const worldRot = Mat4.getRotation(this.worldMatrix);
    const forward = Vec3.create(0, 0, 1);
    return Vec3.transformQuat(forward, worldRot, out ?? forward);
  }
}
