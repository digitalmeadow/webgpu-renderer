export class Vec3 {
  readonly data: Float32Array;

  constructor(x = 0, y = 0, z = 0) {
    this.data = new Float32Array(3);
    this.data[0] = x;
    this.data[1] = y;
    this.data[2] = z;
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

  set(x: number, y: number, z: number): this {
    this.data[0] = x;
    this.data[1] = y;
    this.data[2] = z;
    return this;
  }

  copy(): Vec3 {
    return new Vec3(this.data[0], this.data[1], this.data[2]);
  }

  clone(): Vec3 {
    return this.copy();
  }

  static create(x = 0, y = 0, z = 0): Vec3 {
    return new Vec3(x, y, z);
  }

  static copy(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0];
    out.data[1] = a.data[1];
    out.data[2] = a.data[2];
    return out;
  }

  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static add(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] + b.data[0];
    out.data[1] = a.data[1] + b.data[1];
    out.data[2] = a.data[2] + b.data[2];
    return out;
  }

  static addScaled(a: Vec3, b: Vec3, scale: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] + b.data[0] * scale;
    out.data[1] = a.data[1] + b.data[1] * scale;
    out.data[2] = a.data[2] + b.data[2] * scale;
    return out;
  }

  static sub(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] - b.data[0];
    out.data[1] = a.data[1] - b.data[1];
    out.data[2] = a.data[2] - b.data[2];
    return out;
  }

  static mul(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] * b.data[0];
    out.data[1] = a.data[1] * b.data[1];
    out.data[2] = a.data[2] * b.data[2];
    return out;
  }

  static div(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] / b.data[0];
    out.data[1] = a.data[1] / b.data[1];
    out.data[2] = a.data[2] / b.data[2];
    return out;
  }

  static scale(a: Vec3, s: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] * s;
    out.data[1] = a.data[1] * s;
    out.data[2] = a.data[2] * s;
    return out;
  }

  static dot(a: Vec3, b: Vec3): number {
    return (
      a.data[0] * b.data[0] + a.data[1] * b.data[1] + a.data[2] * b.data[2]
    );
  }

  static cross(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const ax = a.data[0],
      ay = a.data[1],
      az = a.data[2];
    const bx = b.data[0],
      by = b.data[1],
      bz = b.data[2];
    out.data[0] = ay * bz - az * by;
    out.data[1] = az * bx - ax * bz;
    out.data[2] = ax * by - ay * bx;
    return out;
  }

  static len(a: Vec3): number {
    return Math.sqrt(a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2);
  }

  static lengthSquared(a: Vec3): number {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2;
  }

  static normalize(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const len = Vec3.len(a);
    if (len > 0) {
      const scale = 1 / len;
      out.data[0] = a.data[0] * scale;
      out.data[1] = a.data[1] * scale;
      out.data[2] = a.data[2] * scale;
    }
    return out;
  }

  static distance(a: Vec3, b: Vec3): number {
    const dx = a.data[0] - b.data[0];
    const dy = a.data[1] - b.data[1];
    const dz = a.data[2] - b.data[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  static distanceSquared(a: Vec3, b: Vec3): number {
    const dx = a.data[0] - b.data[0];
    const dy = a.data[1] - b.data[1];
    const dz = a.data[2] - b.data[2];
    return dx * dx + dy * dy + dz * dz;
  }

  static lerp(a: Vec3, b: Vec3, t: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = a.data[0] + t * (b.data[0] - a.data[0]);
    out.data[1] = a.data[1] + t * (b.data[1] - a.data[1]);
    out.data[2] = a.data[2] + t * (b.data[2] - a.data[2]);
    return out;
  }

  static negate(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = -a.data[0];
    out.data[1] = -a.data[1];
    out.data[2] = -a.data[2];
    return out;
  }

  static inverse(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = 1 / a.data[0];
    out.data[1] = 1 / a.data[1];
    out.data[2] = 1 / a.data[2];
    return out;
  }

  static min(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.min(a.data[0], b.data[0]);
    out.data[1] = Math.min(a.data[1], b.data[1]);
    out.data[2] = Math.min(a.data[2], b.data[2]);
    return out;
  }

  static max(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.max(a.data[0], b.data[0]);
    out.data[1] = Math.max(a.data[1], b.data[1]);
    out.data[2] = Math.max(a.data[2], b.data[2]);
    return out;
  }

  static clamp(a: Vec3, min: number, max: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.min(max, Math.max(min, a.data[0]));
    out.data[1] = Math.min(max, Math.max(min, a.data[1]));
    out.data[2] = Math.min(max, Math.max(min, a.data[2]));
    return out;
  }

  static ceil(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.ceil(a.data[0]);
    out.data[1] = Math.ceil(a.data[1]);
    out.data[2] = Math.ceil(a.data[2]);
    return out;
  }

  static floor(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.floor(a.data[0]);
    out.data[1] = Math.floor(a.data[1]);
    out.data[2] = Math.floor(a.data[2]);
    return out;
  }

  static round(a: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = Math.round(a.data[0]);
    out.data[1] = Math.round(a.data[1]);
    out.data[2] = Math.round(a.data[2]);
    return out;
  }

  static angle(a: Vec3, b: Vec3): number {
    const ax = a.data[0],
      ay = a.data[1],
      az = a.data[2];
    const bx = b.data[0],
      by = b.data[1],
      bz = b.data[2];
    const mag1 = Math.sqrt(ax * ax + ay * ay + az * az);
    const mag2 = Math.sqrt(bx * bx + by * by + bz * bz);
    const mag = mag1 * mag2;
    const dot = Vec3.dot(a, b);
    return mag > 0 ? Math.acos(dot / mag) : 0;
  }

  static random(scale = 1): Vec3 {
    const angle = Math.random() * 2 * Math.PI;
    const z = Math.random() * 2 - 1;
    const zScale = Math.sqrt(1 - z * z) * scale;
    return new Vec3(
      Math.cos(angle) * zScale,
      Math.sin(angle) * zScale,
      z * scale,
    );
  }

  static setLength(a: Vec3, len: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    Vec3.normalize(a, out);
    Vec3.scale(out, len, out);
    return out;
  }

  static truncate(a: Vec3, maxLen: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    if (Vec3.len(a) > maxLen) {
      Vec3.setLength(a, maxLen, out);
    } else {
      Vec3.copy(a, out);
    }
    return out;
  }

  static midpoint(a: Vec3, b: Vec3, out?: Vec3): Vec3 {
    return Vec3.lerp(a, b, 0.5, out);
  }

  static equals(a: Vec3, b: Vec3, epsilon = 0.000001): boolean {
    return (
      Math.abs(a.data[0] - b.data[0]) <= epsilon &&
      Math.abs(a.data[1] - b.data[1]) <= epsilon &&
      Math.abs(a.data[2] - b.data[2]) <= epsilon
    );
  }

  static transformMat4(a: Vec3, m: import("./mat4").Mat4, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const x = a.data[0];
    const y = a.data[1];
    const z = a.data[2];
    const w =
      m.data[3] * x + m.data[7] * y + m.data[11] * z + m.data[15] || 1.0;
    out.data[0] =
      (m.data[0] * x + m.data[4] * y + m.data[8] * z + m.data[12]) / w;
    out.data[1] =
      (m.data[1] * x + m.data[5] * y + m.data[9] * z + m.data[13]) / w;
    out.data[2] =
      (m.data[2] * x + m.data[6] * y + m.data[10] * z + m.data[14]) / w;
    return out;
  }

  static transformQuat(a: Vec3, q: import("./quat").Quat, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const qx = q.data[0];
    const qy = q.data[1];
    const qz = q.data[2];
    const w2 = q.data[3] * 2;

    const x = a.data[0];
    const y = a.data[1];
    const z = a.data[2];

    const uvX = qy * z - qz * y;
    const uvY = qz * x - qx * z;
    const uvZ = qx * y - qy * x;

    out.data[0] = x + uvX * w2 + (qy * uvZ - qz * uvY) * 2;
    out.data[1] = y + uvY * w2 + (qz * uvX - qx * uvZ) * 2;
    out.data[2] = z + uvZ * w2 + (qx * uvY - qy * uvX) * 2;
    return out;
  }

  static rotateX(a: Vec3, b: Vec3, rad: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    let p = [
      a.data[0] - b.data[0],
      a.data[1] - b.data[1],
      a.data[2] - b.data[2],
    ];
    let r: number[];
    r = [
      p[0],
      p[1] * Math.cos(rad) - p[2] * Math.sin(rad),
      p[1] * Math.sin(rad) + p[2] * Math.cos(rad),
    ];
    out.data[0] = r[0] + b.data[0];
    out.data[1] = r[1] + b.data[1];
    out.data[2] = r[2] + b.data[2];
    return out;
  }

  static rotateY(a: Vec3, b: Vec3, rad: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    let p = [
      a.data[0] - b.data[0],
      a.data[1] - b.data[1],
      a.data[2] - b.data[2],
    ];
    let r: number[];
    r = [
      p[2] * Math.sin(rad) + p[0] * Math.cos(rad),
      p[1],
      p[2] * Math.cos(rad) - p[0] * Math.sin(rad),
    ];
    out.data[0] = r[0] + b.data[0];
    out.data[1] = r[1] + b.data[1];
    out.data[2] = r[2] + b.data[2];
    return out;
  }

  static rotateZ(a: Vec3, b: Vec3, rad: number, out?: Vec3): Vec3 {
    out ??= new Vec3();
    let p = [
      a.data[0] - b.data[0],
      a.data[1] - b.data[1],
      a.data[2] - b.data[2],
    ];
    let r: number[];
    r = [
      p[0] * Math.cos(rad) - p[1] * Math.sin(rad),
      p[0] * Math.sin(rad) + p[1] * Math.cos(rad),
      p[2],
    ];
    out.data[0] = r[0] + b.data[0];
    out.data[1] = r[1] + b.data[1];
    out.data[2] = r[2] + b.data[2];
    return out;
  }
}
