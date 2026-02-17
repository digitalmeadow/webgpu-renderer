class v {
  constructor(a = 0, t = 0) {
    this.data = new Float32Array(2), this.data[0] = a, this.data[1] = t;
  }
  get x() {
    return this.data[0];
  }
  set x(a) {
    this.data[0] = a;
  }
  get y() {
    return this.data[1];
  }
  set y(a) {
    this.data[1] = a;
  }
  set(a, t) {
    return this.data[0] = a, this.data[1] = t, this;
  }
  copy() {
    return new v(this.data[0], this.data[1]);
  }
  clone() {
    return this.copy();
  }
  static create(a = 0, t = 0) {
    return new v(a, t);
  }
  static copy(a, t) {
    return t ??= new v(), t.data[0] = a.data[0], t.data[1] = a.data[1], t;
  }
  static zero() {
    return new v(0, 0);
  }
  static add(a, t, d) {
    return d ??= new v(), d.data[0] = a.data[0] + t.data[0], d.data[1] = a.data[1] + t.data[1], d;
  }
  static addScaled(a, t, d, n) {
    return n ??= new v(), n.data[0] = a.data[0] + t.data[0] * d, n.data[1] = a.data[1] + t.data[1] * d, n;
  }
  static sub(a, t, d) {
    return d ??= new v(), d.data[0] = a.data[0] - t.data[0], d.data[1] = a.data[1] - t.data[1], d;
  }
  static mul(a, t, d) {
    return d ??= new v(), d.data[0] = a.data[0] * t.data[0], d.data[1] = a.data[1] * t.data[1], d;
  }
  static div(a, t, d) {
    return d ??= new v(), d.data[0] = a.data[0] / t.data[0], d.data[1] = a.data[1] / t.data[1], d;
  }
  static scale(a, t, d) {
    return d ??= new v(), d.data[0] = a.data[0] * t, d.data[1] = a.data[1] * t, d;
  }
  static dot(a, t) {
    return a.data[0] * t.data[0] + a.data[1] * t.data[1];
  }
  static len(a) {
    return Math.sqrt(a.data[0] ** 2 + a.data[1] ** 2);
  }
  static lengthSquared(a) {
    return a.data[0] ** 2 + a.data[1] ** 2;
  }
  static normalize(a, t) {
    t ??= new v();
    const d = v.len(a);
    if (d > 0) {
      const n = 1 / d;
      t.data[0] = a.data[0] * n, t.data[1] = a.data[1] * n;
    }
    return t;
  }
  static distance(a, t) {
    const d = a.data[0] - t.data[0], n = a.data[1] - t.data[1];
    return Math.sqrt(d * d + n * n);
  }
  static distanceSquared(a, t) {
    const d = a.data[0] - t.data[0], n = a.data[1] - t.data[1];
    return d * d + n * n;
  }
  static lerp(a, t, d, n) {
    return n ??= new v(), n.data[0] = a.data[0] + d * (t.data[0] - a.data[0]), n.data[1] = a.data[1] + d * (t.data[1] - a.data[1]), n;
  }
  static negate(a, t) {
    return t ??= new v(), t.data[0] = -a.data[0], t.data[1] = -a.data[1], t;
  }
  static inverse(a, t) {
    return t ??= new v(), t.data[0] = 1 / a.data[0], t.data[1] = 1 / a.data[1], t;
  }
  static min(a, t, d) {
    return d ??= new v(), d.data[0] = Math.min(a.data[0], t.data[0]), d.data[1] = Math.min(a.data[1], t.data[1]), d;
  }
  static max(a, t, d) {
    return d ??= new v(), d.data[0] = Math.max(a.data[0], t.data[0]), d.data[1] = Math.max(a.data[1], t.data[1]), d;
  }
  static clamp(a, t, d, n) {
    return n ??= new v(), n.data[0] = Math.min(d, Math.max(t, a.data[0])), n.data[1] = Math.min(d, Math.max(t, a.data[1])), n;
  }
  static ceil(a, t) {
    return t ??= new v(), t.data[0] = Math.ceil(a.data[0]), t.data[1] = Math.ceil(a.data[1]), t;
  }
  static floor(a, t) {
    return t ??= new v(), t.data[0] = Math.floor(a.data[0]), t.data[1] = Math.floor(a.data[1]), t;
  }
  static round(a, t) {
    return t ??= new v(), t.data[0] = Math.round(a.data[0]), t.data[1] = Math.round(a.data[1]), t;
  }
  static angle(a, t) {
    const d = a.data[0], n = a.data[1], s = t.data[0], r = t.data[1], e = Math.sqrt(d * d + n * n), w = Math.sqrt(s * s + r * r), c = e * w, i = v.dot(a, t);
    return c > 0 ? Math.acos(i / c) : 0;
  }
  static random(a = 1) {
    const t = Math.random() * 2 * Math.PI;
    return new v(Math.cos(t) * a, Math.sin(t) * a);
  }
  static setLength(a, t, d) {
    return d ??= new v(), v.normalize(a, d), v.scale(d, t, d), d;
  }
  static truncate(a, t, d) {
    return d ??= new v(), v.len(a) > t ? v.setLength(a, t, d) : v.copy(a, d), d;
  }
  static midpoint(a, t, d) {
    return v.lerp(a, t, 0.5, d);
  }
  static rotate(a, t, d, n) {
    n ??= new v();
    const s = a.data[0] - t.data[0], r = a.data[1] - t.data[1], e = Math.sin(d), w = Math.cos(d);
    return n.data[0] = s * w - r * e + t.data[0], n.data[1] = s * e + r * w + t.data[1], n;
  }
  static equals(a, t, d = 1e-6) {
    return Math.abs(a.data[0] - t.data[0]) <= d && Math.abs(a.data[1] - t.data[1]) <= d;
  }
  static transformMat4(a, t, d) {
    d ??= new v();
    const n = a.data[0], s = a.data[1];
    return d.data[0] = n * t.data[0] + s * t.data[4] + t.data[12], d.data[1] = n * t.data[1] + s * t.data[5] + t.data[13], d;
  }
}
class f {
  constructor(a = 0, t = 0, d = 0) {
    this.data = new Float32Array(3), this.data[0] = a, this.data[1] = t, this.data[2] = d;
  }
  get x() {
    return this.data[0];
  }
  set x(a) {
    this.data[0] = a;
  }
  get y() {
    return this.data[1];
  }
  set y(a) {
    this.data[1] = a;
  }
  get z() {
    return this.data[2];
  }
  set z(a) {
    this.data[2] = a;
  }
  set(a, t, d) {
    return this.data[0] = a, this.data[1] = t, this.data[2] = d, this;
  }
  copy() {
    return new f(this.data[0], this.data[1], this.data[2]);
  }
  clone() {
    return this.copy();
  }
  static create(a = 0, t = 0, d = 0) {
    return new f(a, t, d);
  }
  static copy(a, t) {
    return t ??= new f(), t.data[0] = a.data[0], t.data[1] = a.data[1], t.data[2] = a.data[2], t;
  }
  static zero() {
    return new f(0, 0, 0);
  }
  static add(a, t, d) {
    return d ??= new f(), d.data[0] = a.data[0] + t.data[0], d.data[1] = a.data[1] + t.data[1], d.data[2] = a.data[2] + t.data[2], d;
  }
  static addScaled(a, t, d, n) {
    return n ??= new f(), n.data[0] = a.data[0] + t.data[0] * d, n.data[1] = a.data[1] + t.data[1] * d, n.data[2] = a.data[2] + t.data[2] * d, n;
  }
  static sub(a, t, d) {
    return d ??= new f(), d.data[0] = a.data[0] - t.data[0], d.data[1] = a.data[1] - t.data[1], d.data[2] = a.data[2] - t.data[2], d;
  }
  static mul(a, t, d) {
    return d ??= new f(), d.data[0] = a.data[0] * t.data[0], d.data[1] = a.data[1] * t.data[1], d.data[2] = a.data[2] * t.data[2], d;
  }
  static div(a, t, d) {
    return d ??= new f(), d.data[0] = a.data[0] / t.data[0], d.data[1] = a.data[1] / t.data[1], d.data[2] = a.data[2] / t.data[2], d;
  }
  static scale(a, t, d) {
    return d ??= new f(), d.data[0] = a.data[0] * t, d.data[1] = a.data[1] * t, d.data[2] = a.data[2] * t, d;
  }
  static dot(a, t) {
    return a.data[0] * t.data[0] + a.data[1] * t.data[1] + a.data[2] * t.data[2];
  }
  static cross(a, t, d) {
    d ??= new f();
    const n = a.data[0], s = a.data[1], r = a.data[2], e = t.data[0], w = t.data[1], c = t.data[2];
    return d.data[0] = s * c - r * w, d.data[1] = r * e - n * c, d.data[2] = n * w - s * e, d;
  }
  static len(a) {
    return Math.sqrt(a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2);
  }
  static lengthSquared(a) {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2;
  }
  static normalize(a, t) {
    t ??= new f();
    const d = f.len(a);
    if (d > 0) {
      const n = 1 / d;
      t.data[0] = a.data[0] * n, t.data[1] = a.data[1] * n, t.data[2] = a.data[2] * n;
    }
    return t;
  }
  static distance(a, t) {
    const d = a.data[0] - t.data[0], n = a.data[1] - t.data[1], s = a.data[2] - t.data[2];
    return Math.sqrt(d * d + n * n + s * s);
  }
  static distanceSquared(a, t) {
    const d = a.data[0] - t.data[0], n = a.data[1] - t.data[1], s = a.data[2] - t.data[2];
    return d * d + n * n + s * s;
  }
  static lerp(a, t, d, n) {
    return n ??= new f(), n.data[0] = a.data[0] + d * (t.data[0] - a.data[0]), n.data[1] = a.data[1] + d * (t.data[1] - a.data[1]), n.data[2] = a.data[2] + d * (t.data[2] - a.data[2]), n;
  }
  static negate(a, t) {
    return t ??= new f(), t.data[0] = -a.data[0], t.data[1] = -a.data[1], t.data[2] = -a.data[2], t;
  }
  static inverse(a, t) {
    return t ??= new f(), t.data[0] = 1 / a.data[0], t.data[1] = 1 / a.data[1], t.data[2] = 1 / a.data[2], t;
  }
  static min(a, t, d) {
    return d ??= new f(), d.data[0] = Math.min(a.data[0], t.data[0]), d.data[1] = Math.min(a.data[1], t.data[1]), d.data[2] = Math.min(a.data[2], t.data[2]), d;
  }
  static max(a, t, d) {
    return d ??= new f(), d.data[0] = Math.max(a.data[0], t.data[0]), d.data[1] = Math.max(a.data[1], t.data[1]), d.data[2] = Math.max(a.data[2], t.data[2]), d;
  }
  static clamp(a, t, d, n) {
    return n ??= new f(), n.data[0] = Math.min(d, Math.max(t, a.data[0])), n.data[1] = Math.min(d, Math.max(t, a.data[1])), n.data[2] = Math.min(d, Math.max(t, a.data[2])), n;
  }
  static ceil(a, t) {
    return t ??= new f(), t.data[0] = Math.ceil(a.data[0]), t.data[1] = Math.ceil(a.data[1]), t.data[2] = Math.ceil(a.data[2]), t;
  }
  static floor(a, t) {
    return t ??= new f(), t.data[0] = Math.floor(a.data[0]), t.data[1] = Math.floor(a.data[1]), t.data[2] = Math.floor(a.data[2]), t;
  }
  static round(a, t) {
    return t ??= new f(), t.data[0] = Math.round(a.data[0]), t.data[1] = Math.round(a.data[1]), t.data[2] = Math.round(a.data[2]), t;
  }
  static angle(a, t) {
    const d = a.data[0], n = a.data[1], s = a.data[2], r = t.data[0], e = t.data[1], w = t.data[2], c = Math.sqrt(d * d + n * n + s * s), i = Math.sqrt(r * r + e * e + w * w), h = c * i, M = f.dot(a, t);
    return h > 0 ? Math.acos(M / h) : 0;
  }
  static random(a = 1) {
    const t = Math.random() * 2 * Math.PI, d = Math.random() * 2 - 1, n = Math.sqrt(1 - d * d) * a;
    return new f(
      Math.cos(t) * n,
      Math.sin(t) * n,
      d * a
    );
  }
  static setLength(a, t, d) {
    return d ??= new f(), f.normalize(a, d), f.scale(d, t, d), d;
  }
  static truncate(a, t, d) {
    return d ??= new f(), f.len(a) > t ? f.setLength(a, t, d) : f.copy(a, d), d;
  }
  static midpoint(a, t, d) {
    return f.lerp(a, t, 0.5, d);
  }
  static equals(a, t, d = 1e-6) {
    return Math.abs(a.data[0] - t.data[0]) <= d && Math.abs(a.data[1] - t.data[1]) <= d && Math.abs(a.data[2] - t.data[2]) <= d;
  }
  static transformMat4(a, t, d) {
    d ??= new f();
    const n = a.data[0], s = a.data[1], r = a.data[2], e = t.data[3] * n + t.data[7] * s + t.data[11] * r + t.data[15] || 1;
    return d.data[0] = (t.data[0] * n + t.data[4] * s + t.data[8] * r + t.data[12]) / e, d.data[1] = (t.data[1] * n + t.data[5] * s + t.data[9] * r + t.data[13]) / e, d.data[2] = (t.data[2] * n + t.data[6] * s + t.data[10] * r + t.data[14]) / e, d;
  }
  static transformQuat(a, t, d) {
    d ??= new f();
    const n = t.data[0], s = t.data[1], r = t.data[2], e = t.data[3] * 2, w = a.data[0], c = a.data[1], i = a.data[2], h = s * i - r * c, M = r * w - n * i, l = n * c - s * w;
    return d.data[0] = w + h * e + (s * l - r * M) * 2, d.data[1] = c + M * e + (r * h - n * l) * 2, d.data[2] = i + l * e + (n * M - s * h) * 2, d;
  }
  static rotateX(a, t, d, n) {
    n ??= new f();
    let s = [
      a.data[0] - t.data[0],
      a.data[1] - t.data[1],
      a.data[2] - t.data[2]
    ], r;
    return r = [
      s[0],
      s[1] * Math.cos(d) - s[2] * Math.sin(d),
      s[1] * Math.sin(d) + s[2] * Math.cos(d)
    ], n.data[0] = r[0] + t.data[0], n.data[1] = r[1] + t.data[1], n.data[2] = r[2] + t.data[2], n;
  }
  static rotateY(a, t, d, n) {
    n ??= new f();
    let s = [
      a.data[0] - t.data[0],
      a.data[1] - t.data[1],
      a.data[2] - t.data[2]
    ], r;
    return r = [
      s[2] * Math.sin(d) + s[0] * Math.cos(d),
      s[1],
      s[2] * Math.cos(d) - s[0] * Math.sin(d)
    ], n.data[0] = r[0] + t.data[0], n.data[1] = r[1] + t.data[1], n.data[2] = r[2] + t.data[2], n;
  }
  static rotateZ(a, t, d, n) {
    n ??= new f();
    let s = [
      a.data[0] - t.data[0],
      a.data[1] - t.data[1],
      a.data[2] - t.data[2]
    ], r;
    return r = [
      s[0] * Math.cos(d) - s[1] * Math.sin(d),
      s[0] * Math.sin(d) + s[1] * Math.cos(d),
      s[2]
    ], n.data[0] = r[0] + t.data[0], n.data[1] = r[1] + t.data[1], n.data[2] = r[2] + t.data[2], n;
  }
}
class C {
  constructor(a = 0, t = 0, d = 0, n = 0) {
    this.data = new Float32Array(4), this.data[0] = a, this.data[1] = t, this.data[2] = d, this.data[3] = n;
  }
  get x() {
    return this.data[0];
  }
  set x(a) {
    this.data[0] = a;
  }
  get y() {
    return this.data[1];
  }
  set y(a) {
    this.data[1] = a;
  }
  get z() {
    return this.data[2];
  }
  set z(a) {
    this.data[2] = a;
  }
  get w() {
    return this.data[3];
  }
  set w(a) {
    this.data[3] = a;
  }
  set(a, t, d, n) {
    return this.data[0] = a, this.data[1] = t, this.data[2] = d, this.data[3] = n, this;
  }
  copy() {
    return new C(this.data[0], this.data[1], this.data[2], this.data[3]);
  }
  clone() {
    return this.copy();
  }
  static create(a = 0, t = 0, d = 0, n = 0) {
    return new C(a, t, d, n);
  }
  static add(a, t, d) {
    return d ??= new C(), d.data[0] = a.data[0] + t.data[0], d.data[1] = a.data[1] + t.data[1], d.data[2] = a.data[2] + t.data[2], d.data[3] = a.data[3] + t.data[3], d;
  }
  static sub(a, t, d) {
    return d ??= new C(), d.data[0] = a.data[0] - t.data[0], d.data[1] = a.data[1] - t.data[1], d.data[2] = a.data[2] - t.data[2], d.data[3] = a.data[3] - t.data[3], d;
  }
  static scale(a, t, d) {
    return d ??= new C(), d.data[0] = a.data[0] * t, d.data[1] = a.data[1] * t, d.data[2] = a.data[2] * t, d.data[3] = a.data[3] * t, d;
  }
  static dot(a, t) {
    return a.data[0] * t.data[0] + a.data[1] * t.data[1] + a.data[2] * t.data[2] + a.data[3] * t.data[3];
  }
  static len(a) {
    return Math.sqrt(
      a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2
    );
  }
  static lengthSquared(a) {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2;
  }
  static normalize(a, t) {
    t ??= new C();
    const d = C.len(a);
    return d > 0 && (t.data[0] = a.data[0] / d, t.data[1] = a.data[1] / d, t.data[2] = a.data[2] / d, t.data[3] = a.data[3] / d), t;
  }
  static distance(a, t) {
    return C.len(C.sub(a, t));
  }
  static lerp(a, t, d, n) {
    return n ??= new C(), n.data[0] = a.data[0] + d * (t.data[0] - a.data[0]), n.data[1] = a.data[1] + d * (t.data[1] - a.data[1]), n.data[2] = a.data[2] + d * (t.data[2] - a.data[2]), n.data[3] = a.data[3] + d * (t.data[3] - a.data[3]), n;
  }
  static negate(a, t) {
    return t ??= new C(), t.data[0] = -a.data[0], t.data[1] = -a.data[1], t.data[2] = -a.data[2], t.data[3] = -a.data[3], t;
  }
  static equals(a, t, d = 1e-6) {
    return Math.abs(a.data[0] - t.data[0]) <= d && Math.abs(a.data[1] - t.data[1]) <= d && Math.abs(a.data[2] - t.data[2]) <= d && Math.abs(a.data[3] - t.data[3]) <= d;
  }
}
class k {
  constructor(a = 0, t = 0, d = 0, n = 1) {
    this.data = new Float32Array(4), this.data[0] = a, this.data[1] = t, this.data[2] = d, this.data[3] = n;
  }
  get x() {
    return this.data[0];
  }
  set x(a) {
    this.data[0] = a;
  }
  get y() {
    return this.data[1];
  }
  set y(a) {
    this.data[1] = a;
  }
  get z() {
    return this.data[2];
  }
  set z(a) {
    this.data[2] = a;
  }
  get w() {
    return this.data[3];
  }
  set w(a) {
    this.data[3] = a;
  }
  set(a, t, d, n) {
    return this.data[0] = a, this.data[1] = t, this.data[2] = d, this.data[3] = n, this;
  }
  copy() {
    return new k(this.data[0], this.data[1], this.data[2], this.data[3]);
  }
  clone() {
    return this.copy();
  }
  static identity() {
    return new k(0, 0, 0, 1);
  }
  static create(a = 0, t = 0, d = 0, n = 1) {
    return new k(a, t, d, n);
  }
  static zero() {
    return new k(0, 0, 0, 0);
  }
  static copy(a, t) {
    return t ??= new k(), t.data[0] = a.data[0], t.data[1] = a.data[1], t.data[2] = a.data[2], t.data[3] = a.data[3], t;
  }
  static fromAxisAngle(a, t) {
    const d = t * 0.5, n = Math.sin(d);
    return new k(
      a.data[0] * n,
      a.data[1] * n,
      a.data[2] * n,
      Math.cos(d)
    );
  }
  static toAxisAngle(a) {
    const t = Math.acos(a.data[3]) * 2, d = Math.sin(t * 0.5), n = new f();
    return d > 1e-6 ? (n.data[0] = a.data[0] / d, n.data[1] = a.data[1] / d, n.data[2] = a.data[2] / d) : (n.data[0] = 1, n.data[1] = 0, n.data[2] = 0), { angle: t, axis: n };
  }
  static multiply(a, t, d) {
    d ??= new k();
    const n = a.data[0], s = a.data[1], r = a.data[2], e = a.data[3], w = t.data[0], c = t.data[1], i = t.data[2], h = t.data[3];
    return d.data[0] = n * h + e * w + s * i - r * c, d.data[1] = s * h + e * c + r * w - n * i, d.data[2] = r * h + e * i + n * c - s * w, d.data[3] = e * h - n * w - s * c - r * i, d;
  }
  static slerp(a, t, d, n) {
    n ??= new k();
    let s = a.data[0], r = a.data[1], e = a.data[2], w = a.data[3], c = t.data[0], i = t.data[1], h = t.data[2], M = t.data[3], l = s * c + r * i + e * h + w * M;
    l < 0 && (l = -l, c = -c, i = -i, h = -h, M = -M);
    let y, x;
    if (1 - l > 1e-6) {
      const p = Math.acos(l), z = Math.sin(p);
      y = Math.sin((1 - d) * p) / z, x = Math.sin(d * p) / z;
    } else
      y = 1 - d, x = d;
    return n.data[0] = y * s + x * c, n.data[1] = y * r + x * i, n.data[2] = y * e + x * h, n.data[3] = y * w + x * M, n;
  }
  static len(a) {
    return Math.sqrt(
      a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2
    );
  }
  static lengthSquared(a) {
    return a.data[0] ** 2 + a.data[1] ** 2 + a.data[2] ** 2 + a.data[3] ** 2;
  }
  static normalize(a, t) {
    t ??= new k();
    const d = k.len(a);
    if (d > 1e-5) {
      const n = 1 / d;
      t.data[0] = a.data[0] * n, t.data[1] = a.data[1] * n, t.data[2] = a.data[2] * n, t.data[3] = a.data[3] * n;
    } else
      t.data[0] = 0, t.data[1] = 0, t.data[2] = 0, t.data[3] = 1;
    return t;
  }
  static invert(a, t) {
    t ??= new k();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[3], e = d * d + n * n + s * s + r * r, w = e > 0 ? 1 / e : 0;
    return t.data[0] = -d * w, t.data[1] = -n * w, t.data[2] = -s * w, t.data[3] = r * w, t;
  }
  static conjugate(a, t) {
    return t ??= new k(), t.data[0] = -a.data[0], t.data[1] = -a.data[1], t.data[2] = -a.data[2], t.data[3] = a.data[3], t;
  }
  static fromEuler(a, t, d, n) {
    return n ??= new k(), k.fromEulerOrder(a, t, d, "xyz", n);
  }
  static fromEulerOrder(a, t, d, n, s) {
    s ??= new k();
    const r = a * 0.5, e = t * 0.5, w = d * 0.5, c = Math.sin(r), i = Math.cos(r), h = Math.sin(e), M = Math.cos(e), l = Math.sin(w), y = Math.cos(w);
    switch (n) {
      case "xyz":
        s.data[0] = c * M * y + i * h * l, s.data[1] = i * h * y - c * M * l, s.data[2] = i * M * l + c * h * y, s.data[3] = i * M * y - c * h * l;
        break;
      case "xzy":
        s.data[0] = c * M * y - i * h * l, s.data[1] = i * h * y - c * M * l, s.data[2] = i * M * l + c * h * y, s.data[3] = i * M * y + c * h * l;
        break;
      case "yxz":
        s.data[0] = c * M * y + i * h * l, s.data[1] = i * h * y - c * M * l, s.data[2] = i * M * l - c * h * y, s.data[3] = i * M * y + c * h * l;
        break;
      case "yzx":
        s.data[0] = c * M * y + i * h * l, s.data[1] = i * h * y + c * M * l, s.data[2] = i * M * l - c * h * y, s.data[3] = i * M * y - c * h * l;
        break;
      case "zxy":
        s.data[0] = c * M * y - i * h * l, s.data[1] = i * h * y + c * M * l, s.data[2] = i * M * l + c * h * y, s.data[3] = i * M * y - c * h * l;
        break;
      case "zyx":
        s.data[0] = c * M * y - i * h * l, s.data[1] = i * h * y + c * M * l, s.data[2] = i * M * l - c * h * y, s.data[3] = i * M * y + c * h * l;
        break;
    }
    return s;
  }
  static fromMat(a, t) {
    t ??= new k();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[4], e = a.data[5], w = a.data[6], c = a.data[8], i = a.data[9], h = a.data[10], M = d + e + h;
    if (M > 0) {
      const l = Math.sqrt(M + 1);
      t.data[3] = 0.5 * l;
      const y = 0.5 / l;
      t.data[0] = (i - w) * y, t.data[1] = (s - c) * y, t.data[2] = (r - n) * y;
    } else if (d > e && d > h) {
      const l = Math.sqrt(1 + d - e - h);
      t.data[0] = 0.5 * l;
      const y = 0.5 / l;
      t.data[1] = (n + r) * y, t.data[2] = (s + c) * y, t.data[3] = (i - w) * y;
    } else if (e > h) {
      const l = Math.sqrt(1 + e - d - h);
      t.data[1] = 0.5 * l;
      const y = 0.5 / l;
      t.data[0] = (n + r) * y, t.data[2] = (w + i) * y, t.data[3] = (s - c) * y;
    } else {
      const l = Math.sqrt(1 + h - d - e);
      t.data[2] = 0.5 * l;
      const y = 0.5 / l;
      t.data[0] = (s + c) * y, t.data[1] = (w + i) * y, t.data[3] = (r - n) * y;
    }
    return t;
  }
  static dot(a, t) {
    return a.data[0] * t.data[0] + a.data[1] * t.data[1] + a.data[2] * t.data[2] + a.data[3] * t.data[3];
  }
  static add(a, t, d) {
    return d ??= new k(), d.data[0] = a.data[0] + t.data[0], d.data[1] = a.data[1] + t.data[1], d.data[2] = a.data[2] + t.data[2], d.data[3] = a.data[3] + t.data[3], d;
  }
  static sub(a, t, d) {
    return d ??= new k(), d.data[0] = a.data[0] - t.data[0], d.data[1] = a.data[1] - t.data[1], d.data[2] = a.data[2] - t.data[2], d.data[3] = a.data[3] - t.data[3], d;
  }
  static scale(a, t, d) {
    return d ??= new k(), d.data[0] = a.data[0] * t, d.data[1] = a.data[1] * t, d.data[2] = a.data[2] * t, d.data[3] = a.data[3] * t, d;
  }
  static lerp(a, t, d, n) {
    return n ??= new k(), n.data[0] = a.data[0] + d * (t.data[0] - a.data[0]), n.data[1] = a.data[1] + d * (t.data[1] - a.data[1]), n.data[2] = a.data[2] + d * (t.data[2] - a.data[2]), n.data[3] = a.data[3] + d * (t.data[3] - a.data[3]), n;
  }
  static angle(a, t) {
    const d = k.dot(a, t);
    return Math.acos(2 * d * d - 1);
  }
  static rotateX(a, t, d) {
    d ??= new k();
    const n = t * 0.5, s = a.data[0], r = a.data[1], e = a.data[2], w = a.data[3], c = Math.sin(n), i = Math.cos(n);
    return d.data[0] = s * i + w * c, d.data[1] = r * i + e * c, d.data[2] = e * i - r * c, d.data[3] = w * i - s * c, d;
  }
  static rotateY(a, t, d) {
    d ??= new k();
    const n = t * 0.5, s = a.data[0], r = a.data[1], e = a.data[2], w = a.data[3], c = Math.sin(n), i = Math.cos(n);
    return d.data[0] = s * i - e * c, d.data[1] = r * i + w * c, d.data[2] = e * i + s * c, d.data[3] = w * i - r * c, d;
  }
  static rotateZ(a, t, d) {
    d ??= new k();
    const n = t * 0.5, s = a.data[0], r = a.data[1], e = a.data[2], w = a.data[3], c = Math.sin(n), i = Math.cos(n);
    return d.data[0] = s * i + r * c, d.data[1] = r * i - s * c, d.data[2] = e * i + w * c, d.data[3] = w * i - e * c, d;
  }
  static rotationTo(a, t, d) {
    d ??= new k();
    const n = f.dot(a, t);
    if (n < -0.999999) {
      const s = f.cross(a, new f(1, 0, 0));
      f.len(s) < 1e-6 && f.cross(a, new f(0, 1, 0), s), f.normalize(s, s);
      const r = k.fromAxisAngle(s, Math.PI);
      return d.set(r.data[0], r.data[1], r.data[2], r.data[3]), d;
    } else return n > 0.999999 ? (d.data[0] = 0, d.data[1] = 0, d.data[2] = 0, d.data[3] = 1, d) : (f.cross(a, t, D), d.data[0] = D.data[0], d.data[1] = D.data[1], d.data[2] = D.data[2], d.data[3] = 1 + n, k.normalize(d, d));
  }
  static sqlerp(a, t, d, n, s, r) {
    r ??= new k();
    const e = k.slerp(a, n, s), w = k.slerp(t, d, s);
    return k.slerp(e, w, 2 * s * (1 - s), r);
  }
  static equals(a, t, d = 1e-6) {
    return Math.abs(a.data[0] - t.data[0]) <= d && Math.abs(a.data[1] - t.data[1]) <= d && Math.abs(a.data[2] - t.data[2]) <= d && Math.abs(a.data[3] - t.data[3]) <= d;
  }
}
const D = new f();
class X {
  constructor() {
    this.data = new Float32Array(16), this.data.fill(0), this.data[0] = 1, this.data[5] = 1, this.data[10] = 1, this.data[15] = 1;
  }
  static identity() {
    return new X();
  }
  static create() {
    return new X();
  }
  static copy(a, t) {
    return t ??= new X(), t.data.set(a.data), t;
  }
  static clone(a) {
    return X.copy(a);
  }
  static multiply(a, t, d) {
    d ??= new X();
    const n = a.data[0], s = a.data[1], r = a.data[2], e = a.data[3], w = a.data[4], c = a.data[5], i = a.data[6], h = a.data[7], M = a.data[8], l = a.data[9], y = a.data[10], x = a.data[11], p = a.data[12], z = a.data[13], R = a.data[14], F = a.data[15];
    let g = t.data[0], A = t.data[1], q = t.data[2], S = t.data[3];
    return d.data[0] = g * n + A * w + q * M + S * p, d.data[1] = g * s + A * c + q * l + S * z, d.data[2] = g * r + A * i + q * y + S * R, d.data[3] = g * e + A * h + q * x + S * F, g = t.data[4], A = t.data[5], q = t.data[6], S = t.data[7], d.data[4] = g * n + A * w + q * M + S * p, d.data[5] = g * s + A * c + q * l + S * z, d.data[6] = g * r + A * i + q * y + S * R, d.data[7] = g * e + A * h + q * x + S * F, g = t.data[8], A = t.data[9], q = t.data[10], S = t.data[11], d.data[8] = g * n + A * w + q * M + S * p, d.data[9] = g * s + A * c + q * l + S * z, d.data[10] = g * r + A * i + q * y + S * R, d.data[11] = g * e + A * h + q * x + S * F, g = t.data[12], A = t.data[13], q = t.data[14], S = t.data[15], d.data[12] = g * n + A * w + q * M + S * p, d.data[13] = g * s + A * c + q * l + S * z, d.data[14] = g * r + A * i + q * y + S * R, d.data[15] = g * e + A * h + q * x + S * F, d;
  }
  static invert(a, t) {
    t ??= new X();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[3], e = a.data[4], w = a.data[5], c = a.data[6], i = a.data[7], h = a.data[8], M = a.data[9], l = a.data[10], y = a.data[11], x = a.data[12], p = a.data[13], z = a.data[14], R = a.data[15], F = d * w - n * e, g = d * c - s * e, A = d * i - r * e, q = n * c - s * w, S = n * i - r * w, Y = s * i - r * c, Z = h * p - M * x, E = h * z - l * x, I = h * R - y * x, L = M * z - l * p, O = M * R - y * p, P = l * R - y * z;
    let T = F * P - g * O + A * L + q * I - S * E + Y * Z;
    return T ? (T = 1 / T, t.data[0] = (w * P - c * O + i * L) * T, t.data[1] = (s * O - n * P - r * L) * T, t.data[2] = (p * Y - z * S + R * q) * T, t.data[3] = (l * S - M * Y - y * q) * T, t.data[4] = (c * I - e * P - i * E) * T, t.data[5] = (d * P - s * I + r * E) * T, t.data[6] = (z * A - x * Y - R * g) * T, t.data[7] = (h * Y - l * A + y * g) * T, t.data[8] = (e * O - w * I + i * Z) * T, t.data[9] = (n * I - d * O - r * Z) * T, t.data[10] = (x * S - p * A + R * F) * T, t.data[11] = (M * A - h * S - y * F) * T, t.data[12] = (w * E - e * L - c * Z) * T, t.data[13] = (d * L - n * E + s * Z) * T, t.data[14] = (p * g - x * q - z * F) * T, t.data[15] = (h * q - M * g + l * F) * T, t) : null;
  }
  static determinant(a) {
    const t = a.data[0], d = a.data[1], n = a.data[2], s = a.data[3], r = a.data[4], e = a.data[5], w = a.data[6], c = a.data[7], i = a.data[8], h = a.data[9], M = a.data[10], l = a.data[11], y = a.data[12], x = a.data[13], p = a.data[14], z = a.data[15], R = M * z, F = p * l, g = w * z, A = p * c, q = w * l, S = M * c, Y = n * z, Z = p * s, E = n * l, I = M * s, L = n * c, O = w * s, P = R * e + A * h + q * x - (F * e + g * h + S * x), T = F * d + Y * h + I * x - (R * d + Z * h + E * x), j = g * d + Z * e + L * x - (A * d + Y * e + O * x), B = S * d + E * e + O * h - (q * d + I * e + L * h);
    return t * P + r * T + i * j + y * B;
  }
  static transpose(a, t) {
    if (t ??= new X(), a === t) {
      const d = a.data[1], n = a.data[2], s = a.data[3], r = a.data[6], e = a.data[7], w = a.data[11];
      t.data[1] = a.data[4], t.data[2] = a.data[8], t.data[3] = a.data[12], t.data[4] = d, t.data[6] = a.data[9], t.data[7] = a.data[13], t.data[8] = n, t.data[9] = r, t.data[11] = a.data[14], t.data[12] = s, t.data[13] = e, t.data[14] = w;
    } else
      t.data[0] = a.data[0], t.data[1] = a.data[4], t.data[2] = a.data[8], t.data[3] = a.data[12], t.data[4] = a.data[1], t.data[5] = a.data[5], t.data[6] = a.data[9], t.data[7] = a.data[13], t.data[8] = a.data[2], t.data[9] = a.data[6], t.data[10] = a.data[10], t.data[11] = a.data[14], t.data[12] = a.data[3], t.data[13] = a.data[7], t.data[14] = a.data[11], t.data[15] = a.data[15];
    return t;
  }
  static translate(a, t, d) {
    d ??= new X();
    const n = t.data[0], s = t.data[1], r = t.data[2];
    if (a === d)
      d.data[12] = a.data[0] * n + a.data[4] * s + a.data[8] * r + a.data[12], d.data[13] = a.data[1] * n + a.data[5] * s + a.data[9] * r + a.data[13], d.data[14] = a.data[2] * n + a.data[6] * s + a.data[10] * r + a.data[14], d.data[15] = a.data[3] * n + a.data[7] * s + a.data[11] * r + a.data[15];
    else {
      const e = a.data[0], w = a.data[1], c = a.data[2], i = a.data[3], h = a.data[4], M = a.data[5], l = a.data[6], y = a.data[7], x = a.data[8], p = a.data[9], z = a.data[10], R = a.data[11];
      d.data[0] = e, d.data[1] = w, d.data[2] = c, d.data[3] = i, d.data[4] = h, d.data[5] = M, d.data[6] = l, d.data[7] = y, d.data[8] = x, d.data[9] = p, d.data[10] = z, d.data[11] = R, d.data[12] = e * n + h * s + x * r + a.data[12], d.data[13] = w * n + M * s + p * r + a.data[13], d.data[14] = c * n + l * s + z * r + a.data[14], d.data[15] = i * n + y * s + R * r + a.data[15];
    }
    return d;
  }
  static scale(a, t, d) {
    d ??= new X();
    const n = t.data[0], s = t.data[1], r = t.data[2];
    return d.data[0] = a.data[0] * n, d.data[1] = a.data[1] * n, d.data[2] = a.data[2] * n, d.data[3] = a.data[3] * n, d.data[4] = a.data[4] * s, d.data[5] = a.data[5] * s, d.data[6] = a.data[6] * s, d.data[7] = a.data[7] * s, d.data[8] = a.data[8] * r, d.data[9] = a.data[9] * r, d.data[10] = a.data[10] * r, d.data[11] = a.data[11] * r, d.data[12] = a.data[12], d.data[13] = a.data[13], d.data[14] = a.data[14], d.data[15] = a.data[15], d;
  }
  static rotate(a, t, d, n) {
    n ??= new X();
    let s = d.data[0], r = d.data[1], e = d.data[2], w = Math.sqrt(s * s + r * r + e * e);
    if (w < 1e-6) return null;
    w = 1 / w, s *= w, r *= w, e *= w;
    const c = Math.sin(t), i = Math.cos(t), h = 1 - i, M = a.data[0], l = a.data[1], y = a.data[2], x = a.data[3], p = a.data[4], z = a.data[5], R = a.data[6], F = a.data[7], g = a.data[8], A = a.data[9], q = a.data[10], S = a.data[11], Y = s * s * h + i, Z = r * s * h + e * c, E = e * s * h - r * c, I = s * r * h - e * c, L = r * r * h + i, O = e * r * h + s * c, P = s * e * h + r * c, T = r * e * h - s * c, j = e * e * h + i;
    return n.data[0] = M * Y + p * Z + g * E, n.data[1] = l * Y + z * Z + A * E, n.data[2] = y * Y + R * Z + q * E, n.data[3] = x * Y + F * Z + S * E, n.data[4] = M * I + p * L + g * O, n.data[5] = l * I + z * L + A * O, n.data[6] = y * I + R * L + q * O, n.data[7] = x * I + F * L + S * O, n.data[8] = M * P + p * T + g * j, n.data[9] = l * P + z * T + A * j, n.data[10] = y * P + R * T + q * j, n.data[11] = x * P + F * T + S * j, a !== n && (n.data[12] = a.data[12], n.data[13] = a.data[13], n.data[14] = a.data[14], n.data[15] = a.data[15]), n;
  }
  static rotateX(a, t, d) {
    d ??= new X();
    const n = Math.sin(t), s = Math.cos(t), r = a.data[4], e = a.data[5], w = a.data[6], c = a.data[7], i = a.data[8], h = a.data[9], M = a.data[10], l = a.data[11];
    return a !== d && (d.data[0] = a.data[0], d.data[1] = a.data[1], d.data[2] = a.data[2], d.data[3] = a.data[3], d.data[12] = a.data[12], d.data[13] = a.data[13], d.data[14] = a.data[14], d.data[15] = a.data[15]), d.data[4] = r * s + i * n, d.data[5] = e * s + h * n, d.data[6] = w * s + M * n, d.data[7] = c * s + l * n, d.data[8] = i * s - r * n, d.data[9] = h * s - e * n, d.data[10] = M * s - w * n, d.data[11] = l * s - c * n, d;
  }
  static rotateY(a, t, d) {
    d ??= new X();
    const n = Math.sin(t), s = Math.cos(t), r = a.data[0], e = a.data[1], w = a.data[2], c = a.data[3], i = a.data[8], h = a.data[9], M = a.data[10], l = a.data[11];
    return a !== d && (d.data[4] = a.data[4], d.data[5] = a.data[5], d.data[6] = a.data[6], d.data[7] = a.data[7], d.data[12] = a.data[12], d.data[13] = a.data[13], d.data[14] = a.data[14], d.data[15] = a.data[15]), d.data[0] = r * s - i * n, d.data[1] = e * s - h * n, d.data[2] = w * s - M * n, d.data[3] = c * s - l * n, d.data[8] = r * n + i * s, d.data[9] = e * n + h * s, d.data[10] = w * n + M * s, d.data[11] = c * n + l * s, d;
  }
  static rotateZ(a, t, d) {
    d ??= new X();
    const n = Math.sin(t), s = Math.cos(t), r = a.data[0], e = a.data[1], w = a.data[2], c = a.data[3], i = a.data[4], h = a.data[5], M = a.data[6], l = a.data[7];
    return a !== d && (d.data[8] = a.data[8], d.data[9] = a.data[9], d.data[10] = a.data[10], d.data[11] = a.data[11], d.data[12] = a.data[12], d.data[13] = a.data[13], d.data[14] = a.data[14], d.data[15] = a.data[15]), d.data[0] = r * s + i * n, d.data[1] = e * s + h * n, d.data[2] = w * s + M * n, d.data[3] = c * s + l * n, d.data[4] = i * s - r * n, d.data[5] = h * s - e * n, d.data[6] = M * s - w * n, d.data[7] = l * s - c * n, d;
  }
  static fromQuat(a, t) {
    t ??= new X();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[3], e = d + d, w = n + n, c = s + s, i = d * e, h = n * e, M = n * w, l = s * e, y = s * w, x = s * c, p = r * e, z = r * w, R = r * c;
    return t.data[0] = 1 - M - x, t.data[1] = h + R, t.data[2] = l - z, t.data[3] = 0, t.data[4] = h - R, t.data[5] = 1 - i - x, t.data[6] = y + p, t.data[7] = 0, t.data[8] = l + z, t.data[9] = y - p, t.data[10] = 1 - i - M, t.data[11] = 0, t.data[12] = 0, t.data[13] = 0, t.data[14] = 0, t.data[15] = 1, t;
  }
  static fromRotationTranslationScale(a, t, d, n) {
    n ??= new X();
    const s = a.data[0], r = a.data[1], e = a.data[2], w = a.data[3], c = s + s, i = r + r, h = e + e, M = s * c, l = s * i, y = s * h, x = r * i, p = r * h, z = e * h, R = w * c, F = w * i, g = w * h, A = d.data[0], q = d.data[1], S = d.data[2];
    return n.data[0] = (1 - (x + z)) * A, n.data[1] = (l + g) * A, n.data[2] = (y - F) * A, n.data[3] = 0, n.data[4] = (l - g) * q, n.data[5] = (1 - (M + z)) * q, n.data[6] = (p + R) * q, n.data[7] = 0, n.data[8] = (y + F) * S, n.data[9] = (p - R) * S, n.data[10] = (1 - (M + x)) * S, n.data[11] = 0, n.data[12] = t.data[0], n.data[13] = t.data[1], n.data[14] = t.data[2], n.data[15] = 1, n;
  }
  static fromRotationTranslationScaleOrigin(a, t, d, n, s) {
    s ??= new X();
    const r = a.data[0], e = a.data[1], w = a.data[2], c = a.data[3], i = r + r, h = e + e, M = w + w, l = r * i, y = r * h, x = r * M, p = e * h, z = e * M, R = w * M, F = c * i, g = c * h, A = c * M, q = d.data[0], S = d.data[1], Y = d.data[2], Z = n.data[0], E = n.data[1], I = n.data[2], L = Z * p + I * z - E * R, O = E * l + I * x - Z * z, P = Z * z + E * x - I * l;
    return s.data[0] = (1 - (p + R)) * q, s.data[1] = (y + A) * q, s.data[2] = (x - g) * q, s.data[3] = 0, s.data[4] = (y - A) * S, s.data[5] = (1 - (l + R)) * S, s.data[6] = (z + F) * S, s.data[7] = 0, s.data[8] = (x + g) * Y, s.data[9] = (z - F) * Y, s.data[10] = (1 - (l + p)) * Y, s.data[11] = 0, s.data[12] = t.data[0] - L * q, s.data[13] = t.data[1] - O * S, s.data[14] = t.data[2] - P * Y, s.data[15] = 1, s;
  }
  static getTranslation(a, t) {
    return t ??= new f(), t.data[0] = a.data[12], t.data[1] = a.data[13], t.data[2] = a.data[14], t;
  }
  static getRotation(a, t) {
    t ??= new k();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[4], e = a.data[5], w = a.data[6], c = a.data[8], i = a.data[9], h = a.data[10], M = d + e + h;
    let l = 0;
    return M > 0 ? (l = Math.sqrt(M + 1) * 2, t.data[3] = 0.25 * l, t.data[0] = (i - w) / l, t.data[1] = (s - c) / l, t.data[2] = (r - n) / l) : d > e && d > h ? (l = Math.sqrt(1 + d - e - h) * 2, t.data[3] = (i - w) / l, t.data[0] = 0.25 * l, t.data[1] = (n + r) / l, t.data[2] = (s + c) / l) : e > h ? (l = Math.sqrt(1 + e - d - h) * 2, t.data[3] = (s - c) / l, t.data[0] = (n + r) / l, t.data[1] = 0.25 * l, t.data[2] = (w + i) / l) : (l = Math.sqrt(1 + h - d - e) * 2, t.data[3] = (r - n) / l, t.data[0] = (s + c) / l, t.data[1] = (w + i) / l, t.data[2] = 0.25 * l), t;
  }
  static getScaling(a, t) {
    t ??= new f();
    const d = a.data[0], n = a.data[1], s = a.data[2], r = a.data[4], e = a.data[5], w = a.data[6], c = a.data[8], i = a.data[9], h = a.data[10];
    return t.data[0] = Math.sqrt(d * d + n * n + s * s), t.data[1] = Math.sqrt(r * r + e * e + w * w), t.data[2] = Math.sqrt(c * c + i * i + h * h), t;
  }
  static perspective(a, t, d, n, s) {
    s ??= new X();
    const r = 1 / Math.tan(a / 2), e = 1 / (d - n);
    return s.data[0] = r / t, s.data[1] = 0, s.data[2] = 0, s.data[3] = 0, s.data[4] = 0, s.data[5] = r, s.data[6] = 0, s.data[7] = 0, s.data[8] = 0, s.data[9] = 0, s.data[10] = (n + d) * e, s.data[11] = -1, s.data[12] = 0, s.data[13] = 0, s.data[14] = 2 * n * d * e, s.data[15] = 0, s;
  }
  static ortho(a, t, d, n, s, r, e) {
    e ??= new X();
    const w = 1 / (a - t), c = 1 / (d - n), i = 1 / (s - r);
    return e.data[0] = -2 * w, e.data[1] = 0, e.data[2] = 0, e.data[3] = 0, e.data[4] = 0, e.data[5] = -2 * c, e.data[6] = 0, e.data[7] = 0, e.data[8] = 0, e.data[9] = 0, e.data[10] = 2 * i, e.data[11] = 0, e.data[12] = (a + t) * w, e.data[13] = (n + d) * c, e.data[14] = (r + s) * i, e.data[15] = 1, e;
  }
  static lookAt(a, t, d, n) {
    n ??= new X();
    const s = a.data[0], r = a.data[1], e = a.data[2], w = t.data[0], c = t.data[1], i = t.data[2], h = d.data[0], M = d.data[1], l = d.data[2];
    let y = s - w, x = r - c, p = e - i, z = y * y + x * x + p * p;
    z > 0 && (z = 1 / Math.sqrt(z), y *= z, x *= z, p *= z);
    let R = M * p - l * x, F = l * y - h * p, g = h * x - M * y;
    z = R * R + F * F + g * g, z > 0 && (z = 1 / Math.sqrt(z), R *= z, F *= z, g *= z);
    const A = x * g - p * F, q = p * R - y * g, S = y * F - x * R;
    return n.data[0] = R, n.data[1] = A, n.data[2] = y, n.data[3] = 0, n.data[4] = F, n.data[5] = q, n.data[6] = x, n.data[7] = 0, n.data[8] = g, n.data[9] = S, n.data[10] = p, n.data[11] = 0, n.data[12] = -(R * s + F * r + g * e), n.data[13] = -(A * s + q * r + S * e), n.data[14] = -(y * s + x * r + p * e), n.data[15] = 1, n;
  }
}
export {
  X as Mat4,
  k as Quat,
  v as Vec2,
  f as Vec3,
  C as Vec4
};
