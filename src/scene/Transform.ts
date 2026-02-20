import { Vec3, Quat, Mat4 } from "../math";

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

  public lookAt(target: Vec3): this {
    const direction = new Vec3(
      target.data[0] - this.translation.data[0],
      target.data[1] - this.translation.data[1],
      target.data[2] - this.translation.data[2],
    );
    
    const len = Math.sqrt(
      direction.data[0] ** 2 + 
      direction.data[1] ** 2 + 
      direction.data[2] ** 2
    );
    if (len > 0) {
      direction.data[0] /= len;
      direction.data[1] /= len;
      direction.data[2] /= len;
    }

    const up = new Vec3(0, 1, 0);
    let right = new Vec3();
    right.data[0] = up.data[1] * direction.data[2] - up.data[2] * direction.data[1];
    right.data[1] = up.data[2] * direction.data[0] - up.data[0] * direction.data[2];
    right.data[2] = up.data[0] * direction.data[1] - up.data[1] * direction.data[0];
    
    const rightLen = Math.sqrt(right.data[0] ** 2 + right.data[1] ** 2 + right.data[2] ** 2);
    if (rightLen > 0) {
      right.data[0] /= rightLen;
      right.data[1] /= rightLen;
      right.data[2] /= rightLen;
    }

    const newUp = new Vec3(
      direction.data[1] * right.data[2] - direction.data[2] * right.data[1],
      direction.data[2] * right.data[0] - direction.data[0] * right.data[2],
      direction.data[0] * right.data[1] - direction.data[1] * right.data[0],
    );

    const rotMatrix = Mat4.create();
    rotMatrix.data[0] = right.data[0];
    rotMatrix.data[1] = right.data[1];
    rotMatrix.data[2] = right.data[2];
    rotMatrix.data[4] = newUp.data[0];
    rotMatrix.data[5] = newUp.data[1];
    rotMatrix.data[6] = newUp.data[2];
    rotMatrix.data[8] = direction.data[0];
    rotMatrix.data[9] = direction.data[1];
    rotMatrix.data[10] = direction.data[2];

    this.rotation = Mat4.getRotation(rotMatrix, this.rotation);
    this.updateLocalMatrix();
    return this;
  }

  getWorldMatrix(): Mat4 {
    return this.worldMatrix;
  }
}
