export class Vec4 {
  readonly data: Float32Array;

  constructor(x = 0, y = 0, z = 0, w = 0) {
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

  copy(): Vec4 {
    return new Vec4(this.data[0], this.data[1], this.data[2], this.data[3]);
  }

  clone(): Vec4 {
    return this.copy();
  }

  static create(x = 0, y = 0, z = 0, w = 0): Vec4 {
    return new Vec4(x, y, z, w);
  }

  static add(a: Vec4, b: Vec4, out?: Vec4): Vec4 {
    out ??= new Vec4();
    out.data[0] = a.data[0] + b.data[0];
    out.data[1] = a.data[1] + b.data[1];
    out.data[2] = a.data[2] + b.data[2];
    out.data[3] = a.data[3] + b.data[3];
    return out;
  }

  static sub(a: Vec4, b: Vec4, out?: Vec4): Vec4 {
    out ??= new Vec4();
    out.data[0] = a.data[0] - b.data[0];
    out.data[1] = a.data[1] - b.data[1];
    out.data[2] = a.data[2] - b.data[2];
    out.data[3] = a.data[3] - b.data[3];
    return out;
  }

  static scale(a: Vec4, s: number, out?: Vec4): Vec4 {
    out ??= new Vec4();
    out.data[0] = a.data[0] * s;
    out.data[1] = a.data[1] * s;
    out.data[2] = a.data[2] * s;
    out.data[3] = a.data[3] * s;
    return out;
  }

  static dot(a: Vec4, b: Vec4): number {
    return (
      a.data[0] * b.data[0] +
      a.data[1] * b.data[1] +
      a.data[2] * b.data[2] +
      a.data[3] * b.data[3]
    );
  }

  static len(a: Vec4): number {
    return Math.sqrt(
      a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2,
    );
  }

  static lengthSquared(a: Vec4): number {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2;
  }

  static normalize(a: Vec4, out?: Vec4): Vec4 {
    out ??= new Vec4();
    const len = Vec4.len(a);
    if (len > 0) {
      out.data[0] = a.data[0] / len;
      out.data[1] = a.data[1] / len;
      out.data[2] = a.data[2] / len;
      out.data[3] = a.data[3] / len;
    }
    return out;
  }

  static distance(a: Vec4, b: Vec4): number {
    return Vec4.len(Vec4.sub(a, b));
  }

  static lerp(a: Vec4, b: Vec4, t: number, out?: Vec4): Vec4 {
    out ??= new Vec4();
    out.data[0] = a.data[0] + t * (b.data[0] - a.data[0]);
    out.data[1] = a.data[1] + t * (b.data[1] - a.data[1]);
    out.data[2] = a.data[2] + t * (b.data[2] - a.data[2]);
    out.data[3] = a.data[3] + t * (b.data[3] - a.data[3]);
    return out;
  }

  static negate(a: Vec4, out?: Vec4): Vec4 {
    out ??= new Vec4();
    out.data[0] = -a.data[0];
    out.data[1] = -a.data[1];
    out.data[2] = -a.data[2];
    out.data[3] = -a.data[3];
    return out;
  }

  static equals(a: Vec4, b: Vec4, epsilon = 0.000001): boolean {
    return (
      Math.abs(a.data[0] - b.data[0]) <= epsilon &&
      Math.abs(a.data[1] - b.data[1]) <= epsilon &&
      Math.abs(a.data[2] - b.data[2]) <= epsilon &&
      Math.abs(a.data[3] - b.data[3]) <= epsilon
    );
  }
}
