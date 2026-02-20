import { Vec3 } from "./Vec3";
import { Mat4 } from "./Mat4";

export class Quat {
  readonly data: Float32Array;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.data = new Float32Array(4);
    this.data[0] = x;
    this.data[1] = y;
    this.data[2] = z;
    this.data[3] = w;
  }

  get x(): number {
    return this.data[0];
  }
  set x(value: number) {
    this.data[0] = value;
  }

  get y(): number {
    return this.data[1];
  }
  set y(value: number) {
    this.data[1] = value;
  }

  get z(): number {
    return this.data[2];
  }
  set z(value: number) {
    this.data[2] = value;
  }

  get w(): number {
    return this.data[3];
  }
  set w(value: number) {
    this.data[3] = value;
  }

  set(x: number, y: number, z: number, w: number): this {
    this.data[0] = x;
    this.data[1] = y;
    this.data[2] = z;
    this.data[3] = w;
    return this;
  }

  copy(): Quat {
    return new Quat(this.data[0], this.data[1], this.data[2], this.data[3]);
  }

  clone(): Quat {
    return this.copy();
  }

  static identity(): Quat {
    return new Quat(0, 0, 0, 1);
  }

  static create(x = 0, y = 0, z = 0, w = 1): Quat {
    return new Quat(x, y, z, w);
  }

  static zero(): Quat {
    return new Quat(0, 0, 0, 0);
  }

  static copy(a: Quat, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = a.data[0];
    out.data[1] = a.data[1];
    out.data[2] = a.data[2];
    out.data[3] = a.data[3];
    return out;
  }

  static fromAxisAngle(axis: Vec3, rad: number): Quat {
    const halfRad = rad * 0.5;
    const s = Math.sin(halfRad);
    return new Quat(
      axis.data[0] * s,
      axis.data[1] * s,
      axis.data[2] * s,
      Math.cos(halfRad),
    );
  }

  static toAxisAngle(q: Quat): { angle: number; axis: Vec3 } {
    const angle = Math.acos(q.data[3]) * 2;
    const s = Math.sin(angle * 0.5);
    const axis = new Vec3();
    if (s > 0.000001) {
      axis.data[0] = q.data[0] / s;
      axis.data[1] = q.data[1] / s;
      axis.data[2] = q.data[2] / s;
    } else {
      axis.data[0] = 1;
      axis.data[1] = 0;
      axis.data[2] = 0;
    }
    return { angle, axis };
  }

  static multiply(a: Quat, b: Quat, out?: Quat): Quat {
    out ??= new Quat();
    const ax = a.data[0],
      ay = a.data[1],
      az = a.data[2],
      aw = a.data[3];
    const bx = b.data[0],
      by = b.data[1],
      bz = b.data[2],
      bw = b.data[3];
    out.data[0] = ax * bw + aw * bx + ay * bz - az * by;
    out.data[1] = ay * bw + aw * by + az * bx - ax * bz;
    out.data[2] = az * bw + aw * bz + ax * by - ay * bx;
    out.data[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
  }

  static slerp(a: Quat, b: Quat, t: number, out?: Quat): Quat {
    out ??= new Quat();
    let ax = a.data[0],
      ay = a.data[1],
      az = a.data[2],
      aw = a.data[3];
    let bx = b.data[0],
      by = b.data[1],
      bz = b.data[2],
      bw = b.data[3];

    let cosom = ax * bx + ay * by + az * bz + aw * bw;

    if (cosom < 0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }

    let scale0, scale1;
    if (1.0 - cosom > 0.000001) {
      const omega = Math.acos(cosom);
      const sinom = Math.sin(omega);
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else {
      scale0 = 1.0 - t;
      scale1 = t;
    }

    out.data[0] = scale0 * ax + scale1 * bx;
    out.data[1] = scale0 * ay + scale1 * by;
    out.data[2] = scale0 * az + scale1 * bz;
    out.data[3] = scale0 * aw + scale1 * bw;
    return out;
  }

  static len(a: Quat): number {
    return Math.sqrt(
      a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2,
    );
  }

  static lengthSquared(a: Quat): number {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2;
  }

  static normalize(a: Quat, out?: Quat): Quat {
    out ??= new Quat();
    const len = Quat.len(a);
    if (len > 0.00001) {
      const invLen = 1 / len;
      out.data[0] = a.data[0] * invLen;
      out.data[1] = a.data[1] * invLen;
      out.data[2] = a.data[2] * invLen;
      out.data[3] = a.data[3] * invLen;
    } else {
      out.data[0] = 0;
      out.data[1] = 0;
      out.data[2] = 0;
      out.data[3] = 1;
    }
    return out;
  }

  static invert(a: Quat, out?: Quat): Quat {
    out ??= new Quat();
    const a0 = a.data[0],
      a1 = a.data[1],
      a2 = a.data[2],
      a3 = a.data[3];
    const dot = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
    const invDot = dot > 0 ? 1.0 / dot : 0;

    out.data[0] = -a0 * invDot;
    out.data[1] = -a1 * invDot;
    out.data[2] = -a2 * invDot;
    out.data[3] = a3 * invDot;
    return out;
  }

  static conjugate(a: Quat, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = -a.data[0];
    out.data[1] = -a.data[1];
    out.data[2] = -a.data[2];
    out.data[3] = a.data[3];
    return out;
  }

  static fromEuler(x: number, y: number, z: number, out?: Quat): Quat {
    out ??= new Quat();
    return Quat.fromEulerOrder(x, y, z, "xyz", out);
  }

  static fromEulerOrder(
    x: number,
    y: number,
    z: number,
    order: "xyz" | "xzy" | "yxz" | "yzx" | "zxy" | "zyx",
    out?: Quat,
  ): Quat {
    out ??= new Quat();
    const hx = x * 0.5,
      hy = y * 0.5,
      hz = z * 0.5;
    const sx = Math.sin(hx),
      cx = Math.cos(hx);
    const sy = Math.sin(hy),
      cy = Math.cos(hy);
    const sz = Math.sin(hz),
      cz = Math.cos(hz);

    switch (order) {
      case "xyz":
        out.data[0] = sx * cy * cz + cx * sy * sz;
        out.data[1] = cx * sy * cz - sx * cy * sz;
        out.data[2] = cx * cy * sz + sx * sy * cz;
        out.data[3] = cx * cy * cz - sx * sy * sz;
        break;
      case "xzy":
        out.data[0] = sx * cy * cz - cx * sy * sz;
        out.data[1] = cx * sy * cz - sx * cy * sz;
        out.data[2] = cx * cy * sz + sx * sy * cz;
        out.data[3] = cx * cy * cz + sx * sy * sz;
        break;
      case "yxz":
        out.data[0] = sx * cy * cz + cx * sy * sz;
        out.data[1] = cx * sy * cz - sx * cy * sz;
        out.data[2] = cx * cy * sz - sx * sy * cz;
        out.data[3] = cx * cy * cz + sx * sy * sz;
        break;
      case "yzx":
        out.data[0] = sx * cy * cz + cx * sy * sz;
        out.data[1] = cx * sy * cz + sx * cy * sz;
        out.data[2] = cx * cy * sz - sx * sy * cz;
        out.data[3] = cx * cy * cz - sx * sy * sz;
        break;
      case "zxy":
        out.data[0] = sx * cy * cz - cx * sy * sz;
        out.data[1] = cx * sy * cz + sx * cy * sz;
        out.data[2] = cx * cy * sz + sx * sy * cz;
        out.data[3] = cx * cy * cz - sx * sy * sz;
        break;
      case "zyx":
        out.data[0] = sx * cy * cz - cx * sy * sz;
        out.data[1] = cx * sy * cz + sx * cy * sz;
        out.data[2] = cx * cy * sz - sx * sy * cz;
        out.data[3] = cx * cy * cz + sx * sy * sz;
        break;
    }
    return out;
  }

  static fromMat(m: Mat4, out?: Quat): Quat {
    out ??= new Quat();
    const m00 = m.data[0],
      m01 = m.data[1],
      m02 = m.data[2];
    const m10 = m.data[4],
      m11 = m.data[5],
      m12 = m.data[6];
    const m20 = m.data[8],
      m21 = m.data[9],
      m22 = m.data[10];

    const trace = m00 + m11 + m22;

    if (trace > 0) {
      const root = Math.sqrt(trace + 1);
      out.data[3] = 0.5 * root;
      const invRoot = 0.5 / root;
      out.data[0] = (m21 - m12) * invRoot;
      out.data[1] = (m02 - m20) * invRoot;
      out.data[2] = (m10 - m01) * invRoot;
    } else if (m00 > m11 && m00 > m22) {
      const root = Math.sqrt(1.0 + m00 - m11 - m22);
      out.data[0] = 0.5 * root;
      const invRoot = 0.5 / root;
      out.data[1] = (m01 + m10) * invRoot;
      out.data[2] = (m02 + m20) * invRoot;
      out.data[3] = (m21 - m12) * invRoot;
    } else if (m11 > m22) {
      const root = Math.sqrt(1.0 + m11 - m00 - m22);
      out.data[1] = 0.5 * root;
      const invRoot = 0.5 / root;
      out.data[0] = (m01 + m10) * invRoot;
      out.data[2] = (m12 + m21) * invRoot;
      out.data[3] = (m02 - m20) * invRoot;
    } else {
      const root = Math.sqrt(1.0 + m22 - m00 - m11);
      out.data[2] = 0.5 * root;
      const invRoot = 0.5 / root;
      out.data[0] = (m02 + m20) * invRoot;
      out.data[1] = (m12 + m21) * invRoot;
      out.data[3] = (m10 - m01) * invRoot;
    }
    return out;
  }

  static dot(a: Quat, b: Quat): number {
    return (
      a.data[0] * b.data[0] +
      a.data[1] * b.data[1] +
      a.data[2] * b.data[2] +
      a.data[3] * b.data[3]
    );
  }

  static add(a: Quat, b: Quat, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = a.data[0] + b.data[0];
    out.data[1] = a.data[1] + b.data[1];
    out.data[2] = a.data[2] + b.data[2];
    out.data[3] = a.data[3] + b.data[3];
    return out;
  }

  static sub(a: Quat, b: Quat, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = a.data[0] - b.data[0];
    out.data[1] = a.data[1] - b.data[1];
    out.data[2] = a.data[2] - b.data[2];
    out.data[3] = a.data[3] - b.data[3];
    return out;
  }

  static scale(a: Quat, s: number, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = a.data[0] * s;
    out.data[1] = a.data[1] * s;
    out.data[2] = a.data[2] * s;
    out.data[3] = a.data[3] * s;
    return out;
  }

  static lerp(a: Quat, b: Quat, t: number, out?: Quat): Quat {
    out ??= new Quat();
    out.data[0] = a.data[0] + t * (b.data[0] - a.data[0]);
    out.data[1] = a.data[1] + t * (b.data[1] - a.data[1]);
    out.data[2] = a.data[2] + t * (b.data[2] - a.data[2]);
    out.data[3] = a.data[3] + t * (b.data[3] - a.data[3]);
    return out;
  }

  static angle(a: Quat, b: Quat): number {
    const d = Quat.dot(a, b);
    return Math.acos(2 * d * d - 1);
  }

  static rotateX(q: Quat, rad: number, out?: Quat): Quat {
    out ??= new Quat();
    const halfRad = rad * 0.5;
    const qx = q.data[0],
      qy = q.data[1],
      qz = q.data[2],
      qw = q.data[3];
    const bx = Math.sin(halfRad),
      bw = Math.cos(halfRad);
    out.data[0] = qx * bw + qw * bx;
    out.data[1] = qy * bw + qz * bx;
    out.data[2] = qz * bw - qy * bx;
    out.data[3] = qw * bw - qx * bx;
    return out;
  }

  static rotateY(q: Quat, rad: number, out?: Quat): Quat {
    out ??= new Quat();
    const halfRad = rad * 0.5;
    const qx = q.data[0],
      qy = q.data[1],
      qz = q.data[2],
      qw = q.data[3];
    const by = Math.sin(halfRad),
      bw = Math.cos(halfRad);
    out.data[0] = qx * bw - qz * by;
    out.data[1] = qy * bw + qw * by;
    out.data[2] = qz * bw + qx * by;
    out.data[3] = qw * bw - qy * by;
    return out;
  }

  static rotateZ(q: Quat, rad: number, out?: Quat): Quat {
    out ??= new Quat();
    const halfRad = rad * 0.5;
    const qx = q.data[0],
      qy = q.data[1],
      qz = q.data[2],
      qw = q.data[3];
    const bz = Math.sin(halfRad),
      bw = Math.cos(halfRad);
    out.data[0] = qx * bw + qy * bz;
    out.data[1] = qy * bw - qx * bz;
    out.data[2] = qz * bw + qw * bz;
    out.data[3] = qw * bw - qz * bz;
    return out;
  }

  static rotationTo(a: Vec3, b: Vec3, out?: Quat): Quat {
    out ??= new Quat();
    const dot = Vec3.dot(a, b);
    if (dot < -0.999999) {
      const temp = Vec3.cross(a, new Vec3(1, 0, 0));
      if (Vec3.len(temp) < 0.000001) {
        Vec3.cross(a, new Vec3(0, 1, 0), temp);
      }
      Vec3.normalize(temp, temp);
      const q = Quat.fromAxisAngle(temp, Math.PI);
      out.set(q.data[0], q.data[1], q.data[2], q.data[3]);
      return out;
    } else if (dot > 0.999999) {
      out.data[0] = 0;
      out.data[1] = 0;
      out.data[2] = 0;
      out.data[3] = 1;
      return out;
    } else {
      Vec3.cross(a, b, tempVec3);
      out.data[0] = tempVec3.data[0];
      out.data[1] = tempVec3.data[1];
      out.data[2] = tempVec3.data[2];
      out.data[3] = 1 + dot;
      return Quat.normalize(out, out);
    }
  }

  static sqlerp(
    a: Quat,
    b: Quat,
    c: Quat,
    d: Quat,
    t: number,
    out?: Quat,
  ): Quat {
    out ??= new Quat();
    const temp1 = Quat.slerp(a, d, t);
    const temp2 = Quat.slerp(b, c, t);
    return Quat.slerp(temp1, temp2, 2 * t * (1 - t), out);
  }

  static equals(a: Quat, b: Quat, epsilon = 0.000001): boolean {
    return (
      Math.abs(a.data[0] - b.data[0]) <= epsilon &&
      Math.abs(a.data[1] - b.data[1]) <= epsilon &&
      Math.abs(a.data[2] - b.data[2]) <= epsilon &&
      Math.abs(a.data[3] - b.data[3]) <= epsilon
    );
  }
}

const tempVec3 = new Vec3();
