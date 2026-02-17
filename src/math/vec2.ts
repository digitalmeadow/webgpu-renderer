export class Vec2 {
  readonly data: Float32Array;

  constructor(x = 0, y = 0) {
    this.data = new Float32Array(2);
    this.data[0] = x;
    this.data[1] = y;
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

  set(x: number, y: number): this {
    this.data[0] = x;
    this.data[1] = y;
    return this;
  }

  copy(): Vec2 {
    return new Vec2(this.data[0], this.data[1]);
  }

  clone(): Vec2 {
    return this.copy();
  }

  static create(x = 0, y = 0): Vec2 {
    return new Vec2(x, y);
  }

  static copy(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0];
    out.data[1] = a.data[1];
    return out;
  }

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  static add(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] + b.data[0];
    out.data[1] = a.data[1] + b.data[1];
    return out;
  }

  static addScaled(a: Vec2, b: Vec2, scale: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] + b.data[0] * scale;
    out.data[1] = a.data[1] + b.data[1] * scale;
    return out;
  }

  static sub(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] - b.data[0];
    out.data[1] = a.data[1] - b.data[1];
    return out;
  }

  static mul(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] * b.data[0];
    out.data[1] = a.data[1] * b.data[1];
    return out;
  }

  static div(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] / b.data[0];
    out.data[1] = a.data[1] / b.data[1];
    return out;
  }

  static scale(a: Vec2, s: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] * s;
    out.data[1] = a.data[1] * s;
    return out;
  }

  static dot(a: Vec2, b: Vec2): number {
    return a.data[0] * b.data[0] + a.data[1] * b.data[1];
  }

  static len(a: Vec2): number {
    return Math.sqrt(a.data[0] ** 2 + a.data[1] ** 2);
  }

  static lengthSquared(a: Vec2): number {
    return a.data[0] ** 2 + a.data[1] ** 2;
  }

  static normalize(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    const len = Vec2.len(a);
    if (len > 0) {
      const scale = 1 / len;
      out.data[0] = a.data[0] * scale;
      out.data[1] = a.data[1] * scale;
    }
    return out;
  }

  static distance(a: Vec2, b: Vec2): number {
    const dx = a.data[0] - b.data[0];
    const dy = a.data[1] - b.data[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  static distanceSquared(a: Vec2, b: Vec2): number {
    const dx = a.data[0] - b.data[0];
    const dy = a.data[1] - b.data[1];
    return dx * dx + dy * dy;
  }

  static lerp(a: Vec2, b: Vec2, t: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = a.data[0] + t * (b.data[0] - a.data[0]);
    out.data[1] = a.data[1] + t * (b.data[1] - a.data[1]);
    return out;
  }

  static negate(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = -a.data[0];
    out.data[1] = -a.data[1];
    return out;
  }

  static inverse(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = 1 / a.data[0];
    out.data[1] = 1 / a.data[1];
    return out;
  }

  static min(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.min(a.data[0], b.data[0]);
    out.data[1] = Math.min(a.data[1], b.data[1]);
    return out;
  }

  static max(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.max(a.data[0], b.data[0]);
    out.data[1] = Math.max(a.data[1], b.data[1]);
    return out;
  }

  static clamp(a: Vec2, min: number, max: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.min(max, Math.max(min, a.data[0]));
    out.data[1] = Math.min(max, Math.max(min, a.data[1]));
    return out;
  }

  static ceil(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.ceil(a.data[0]);
    out.data[1] = Math.ceil(a.data[1]);
    return out;
  }

  static floor(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.floor(a.data[0]);
    out.data[1] = Math.floor(a.data[1]);
    return out;
  }

  static round(a: Vec2, out?: Vec2): Vec2 {
    out ??= new Vec2();
    out.data[0] = Math.round(a.data[0]);
    out.data[1] = Math.round(a.data[1]);
    return out;
  }

  static angle(a: Vec2, b: Vec2): number {
    const ax = a.data[0],
      ay = a.data[1];
    const bx = b.data[0],
      by = b.data[1];
    const mag1 = Math.sqrt(ax * ax + ay * ay);
    const mag2 = Math.sqrt(bx * bx + by * by);
    const mag = mag1 * mag2;
    const dot = Vec2.dot(a, b);
    return mag > 0 ? Math.acos(dot / mag) : 0;
  }

  static random(scale = 1): Vec2 {
    const angle = Math.random() * 2 * Math.PI;
    return new Vec2(Math.cos(angle) * scale, Math.sin(angle) * scale);
  }

  static setLength(a: Vec2, len: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    Vec2.normalize(a, out);
    Vec2.scale(out, len, out);
    return out;
  }

  static truncate(a: Vec2, maxLen: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    if (Vec2.len(a) > maxLen) {
      Vec2.setLength(a, maxLen, out);
    } else {
      Vec2.copy(a, out);
    }
    return out;
  }

  static midpoint(a: Vec2, b: Vec2, out?: Vec2): Vec2 {
    return Vec2.lerp(a, b, 0.5, out);
  }

  static rotate(a: Vec2, b: Vec2, rad: number, out?: Vec2): Vec2 {
    out ??= new Vec2();
    const p0 = a.data[0] - b.data[0];
    const p1 = a.data[1] - b.data[1];
    const sinC = Math.sin(rad);
    const cosC = Math.cos(rad);
    out.data[0] = p0 * cosC - p1 * sinC + b.data[0];
    out.data[1] = p0 * sinC + p1 * cosC + b.data[1];
    return out;
  }

  static equals(a: Vec2, b: Vec2, epsilon = 0.000001): boolean {
    return (
      Math.abs(a.data[0] - b.data[0]) <= epsilon &&
      Math.abs(a.data[1] - b.data[1]) <= epsilon
    );
  }

  static transformMat4(a: Vec2, m: import("./mat4").Mat4, out?: Vec2): Vec2 {
    out ??= new Vec2();
    const x = a.data[0];
    const y = a.data[1];
    out.data[0] = x * m.data[0] + y * m.data[4] + m.data[12];
    out.data[1] = x * m.data[1] + y * m.data[5] + m.data[13];
    return out;
  }
}
