import { vec3, quat, mat4, Vec3, Quat, Mat4 } from 'wgpu-matrix';

export class Transform {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  localMatrix: Mat4;
  worldMatrix: Mat4;

  parent: Transform | null = null;
  children: Transform[] = [];

  constructor() {
    this.translation = vec3.create();
    this.rotation = quat.create();
    quat.identity(this.rotation);
    this.scale = vec3.fromValues(1, 1, 1);
    this.localMatrix = mat4.create();
    this.worldMatrix = mat4.create();
    this.updateLocalMatrix();
  }

  setPosition(x: number, y: number, z: number): this {
    this.translation[0] = x;
    this.translation[1] = y;
    this.translation[2] = z;
    this.updateLocalMatrix();
    return this;
  }

  setRotation(x: number, y: number, z: number): this {
    const rotX = mat4.rotationX(x);
    const rotY = mat4.rotationY(y);
    const rotZ = mat4.rotationZ(z);
    
    let combined = mat4.create();
    mat4.multiply(rotY, rotX, combined);
    mat4.multiply(combined, rotZ, combined);
    
    quat.fromMat(combined, this.rotation);
    quat.normalize(this.rotation, this.rotation);
    this.updateLocalMatrix();
    return this;
  }

  setRotationQuat(x: number, y: number, z: number, w: number): this {
    this.rotation[0] = x;
    this.rotation[1] = y;
    this.rotation[2] = z;
    this.rotation[3] = w;
    this.updateLocalMatrix();
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.scale[0] = x;
    this.scale[1] = y;
    this.scale[2] = z;
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
    const t = mat4.translation(this.translation);
    const r = mat4.fromQuat(this.rotation);
    const s = mat4.scaling(this.scale);
    
    let result = mat4.create();
    mat4.multiply(t, r, result);
    mat4.multiply(result, s, this.localMatrix);
  }

  updateWorldMatrix(parentWorldMatrix?: Mat4): void {
    if (parentWorldMatrix) {
      mat4.multiply(parentWorldMatrix, this.localMatrix, this.worldMatrix);
    } else {
      mat4.copy(this.localMatrix, this.worldMatrix);
    }

    for (const child of this.children) {
      child.updateWorldMatrix(this.worldMatrix);
    }
  }

  public getForward(): Vec3 {
    const forward = vec3.fromValues(0, 0, 1);
    const result = vec3.create();
    vec3.transformQuat(forward, this.rotation, result);
    return result;
  }

  public lookAt(target: Vec3): this {
    // Compute forward direction directly
    const forward = vec3.create();
    vec3.subtract(target, this.translation, forward);
    vec3.normalize(forward, forward);
    
    const up = vec3.fromValues(0, 1, 0);
    
    // Handle case where forward is parallel to up
    const right = vec3.create();
    vec3.cross(forward, up, right);
    
    if (vec3.length(right) < 0.001) {
      vec3.cross(forward, vec3.fromValues(1, 0, 0), right);
    }
    vec3.normalize(right, right);
    
    // Recompute true up
    const newUp = vec3.create();
    vec3.cross(right, forward, newUp);
    
    // Build rotation matrix (3x3 in 4x4 format)
    // Column 2 should be -forward (pointing backward in standard right-handed coords)
    const rotMatrix = mat4.create();
    rotMatrix[0] = right[0];
    rotMatrix[1] = right[1];
    rotMatrix[2] = right[2];
    rotMatrix[4] = newUp[0];
    rotMatrix[5] = newUp[1];
    rotMatrix[6] = newUp[2];
    rotMatrix[8] = -forward[0];
    rotMatrix[9] = -forward[1];
    rotMatrix[10] = -forward[2];
    rotMatrix[15] = 1;
    
    quat.fromMat(rotMatrix, this.rotation);
    quat.normalize(this.rotation, this.rotation);
    
    this.updateLocalMatrix();
    return this;
  }

  getWorldMatrix(): Mat4 {
    return this.worldMatrix;
  }
}
