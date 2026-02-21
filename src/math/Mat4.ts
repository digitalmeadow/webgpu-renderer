import { Quat } from "./Quat";
import { Vec3 } from "./Vec3";

export class Mat4 {
  readonly data: Float32Array;

  constructor() {
    this.data = new Float32Array(16);
    this.data.fill(0);
    this.data[0] = 1;
    this.data[5] = 1;
    this.data[10] = 1;
    this.data[15] = 1;
  }

  static identity(): Mat4 {
    return new Mat4();
  }

  static create(): Mat4 {
    return new Mat4();
  }

  static copy(m: Mat4, out?: Mat4): Mat4 {
    out ??= new Mat4();
    out.data.set(m.data);
    return out;
  }

  static clone(m: Mat4): Mat4 {
    return Mat4.copy(m);
  }

  static multiply(a: Mat4, b: Mat4, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const a00 = a.data[0],
      a01 = a.data[1],
      a02 = a.data[2],
      a03 = a.data[3];
    const a10 = a.data[4],
      a11 = a.data[5],
      a12 = a.data[6],
      a13 = a.data[7];
    const a20 = a.data[8],
      a21 = a.data[9],
      a22 = a.data[10],
      a23 = a.data[11];
    const a30 = a.data[12],
      a31 = a.data[13],
      a32 = a.data[14],
      a33 = a.data[15];

    let b0 = b.data[0],
      b1 = b.data[1],
      b2 = b.data[2],
      b3 = b.data[3];
    out.data[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out.data[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out.data[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out.data[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b.data[4];
    b1 = b.data[5];
    b2 = b.data[6];
    b3 = b.data[7];
    out.data[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out.data[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out.data[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out.data[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b.data[8];
    b1 = b.data[9];
    b2 = b.data[10];
    b3 = b.data[11];
    out.data[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out.data[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out.data[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out.data[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b.data[12];
    b1 = b.data[13];
    b2 = b.data[14];
    b3 = b.data[15];
    out.data[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out.data[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out.data[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out.data[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  }

  static invert(m: Mat4, out?: Mat4): Mat4 | null {
    out ??= new Mat4();
    const a00 = m.data[0],
      a01 = m.data[1],
      a02 = m.data[2],
      a03 = m.data[3];
    const a10 = m.data[4],
      a11 = m.data[5],
      a12 = m.data[6],
      a13 = m.data[7];
    const a20 = m.data[8],
      a21 = m.data[9],
      a22 = m.data[10],
      a23 = m.data[11];
    const a30 = m.data[12],
      a31 = m.data[13],
      a32 = m.data[14],
      a33 = m.data[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1.0 / det;

    out.data[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out.data[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out.data[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out.data[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out.data[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out.data[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out.data[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out.data[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out.data[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out.data[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out.data[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out.data[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out.data[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out.data[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out.data[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out.data[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }

  static determinant(m: Mat4): number {
    const m00 = m.data[0],
      m01 = m.data[1],
      m02 = m.data[2],
      m03 = m.data[3];
    const m10 = m.data[4],
      m11 = m.data[5],
      m12 = m.data[6],
      m13 = m.data[7];
    const m20 = m.data[8],
      m21 = m.data[9],
      m22 = m.data[10],
      m23 = m.data[11];
    const m30 = m.data[12],
      m31 = m.data[13],
      m32 = m.data[14],
      m33 = m.data[15];

    const tmp0 = m22 * m33;
    const tmp1 = m32 * m23;
    const tmp2 = m12 * m33;
    const tmp3 = m32 * m13;
    const tmp4 = m12 * m23;
    const tmp5 = m22 * m13;
    const tmp6 = m02 * m33;
    const tmp7 = m32 * m03;
    const tmp8 = m02 * m23;
    const tmp9 = m22 * m03;
    const tmp10 = m02 * m13;
    const tmp11 = m12 * m03;

    const t0 =
      tmp0 * m11 +
      tmp3 * m21 +
      tmp4 * m31 -
      (tmp1 * m11 + tmp2 * m21 + tmp5 * m31);
    const t1 =
      tmp1 * m01 +
      tmp6 * m21 +
      tmp9 * m31 -
      (tmp0 * m01 + tmp7 * m21 + tmp8 * m31);
    const t2 =
      tmp2 * m01 +
      tmp7 * m11 +
      tmp10 * m31 -
      (tmp3 * m01 + tmp6 * m11 + tmp11 * m31);
    const t3 =
      tmp5 * m01 +
      tmp8 * m11 +
      tmp11 * m21 -
      (tmp4 * m01 + tmp9 * m11 + tmp10 * m21);

    return m00 * t0 + m10 * t1 + m20 * t2 + m30 * t3;
  }

  static transpose(m: Mat4, out?: Mat4): Mat4 {
    out ??= new Mat4();
    if (m === out) {
      const m01 = m.data[1],
        m02 = m.data[2],
        m03 = m.data[3];
      const m12 = m.data[6],
        m13 = m.data[7];
      const m23 = m.data[11];
      out.data[1] = m.data[4];
      out.data[2] = m.data[8];
      out.data[3] = m.data[12];
      out.data[4] = m01;
      out.data[6] = m.data[9];
      out.data[7] = m.data[13];
      out.data[8] = m02;
      out.data[9] = m12;
      out.data[11] = m.data[14];
      out.data[12] = m03;
      out.data[13] = m13;
      out.data[14] = m23;
    } else {
      out.data[0] = m.data[0];
      out.data[1] = m.data[4];
      out.data[2] = m.data[8];
      out.data[3] = m.data[12];
      out.data[4] = m.data[1];
      out.data[5] = m.data[5];
      out.data[6] = m.data[9];
      out.data[7] = m.data[13];
      out.data[8] = m.data[2];
      out.data[9] = m.data[6];
      out.data[10] = m.data[10];
      out.data[11] = m.data[14];
      out.data[12] = m.data[3];
      out.data[13] = m.data[7];
      out.data[14] = m.data[11];
      out.data[15] = m.data[15];
    }
    return out;
  }

  static translate(m: Mat4, v: Vec3, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const x = v.data[0],
      y = v.data[1],
      z = v.data[2];

    if (m === out) {
      out.data[12] = m.data[0] * x + m.data[4] * y + m.data[8] * z + m.data[12];
      out.data[13] = m.data[1] * x + m.data[5] * y + m.data[9] * z + m.data[13];
      out.data[14] =
        m.data[2] * x + m.data[6] * y + m.data[10] * z + m.data[14];
      out.data[15] =
        m.data[3] * x + m.data[7] * y + m.data[11] * z + m.data[15];
    } else {
      const a00 = m.data[0],
        a01 = m.data[1],
        a02 = m.data[2],
        a03 = m.data[3];
      const a10 = m.data[4],
        a11 = m.data[5],
        a12 = m.data[6],
        a13 = m.data[7];
      const a20 = m.data[8],
        a21 = m.data[9],
        a22 = m.data[10],
        a23 = m.data[11];
      out.data[0] = a00;
      out.data[1] = a01;
      out.data[2] = a02;
      out.data[3] = a03;
      out.data[4] = a10;
      out.data[5] = a11;
      out.data[6] = a12;
      out.data[7] = a13;
      out.data[8] = a20;
      out.data[9] = a21;
      out.data[10] = a22;
      out.data[11] = a23;
      out.data[12] = a00 * x + a10 * y + a20 * z + m.data[12];
      out.data[13] = a01 * x + a11 * y + a21 * z + m.data[13];
      out.data[14] = a02 * x + a12 * y + a22 * z + m.data[14];
      out.data[15] = a03 * x + a13 * y + a23 * z + m.data[15];
    }
    return out;
  }

  static scale(m: Mat4, v: Vec3, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const x = v.data[0],
      y = v.data[1],
      z = v.data[2];

    out.data[0] = m.data[0] * x;
    out.data[1] = m.data[1] * x;
    out.data[2] = m.data[2] * x;
    out.data[3] = m.data[3] * x;
    out.data[4] = m.data[4] * y;
    out.data[5] = m.data[5] * y;
    out.data[6] = m.data[6] * y;
    out.data[7] = m.data[7] * y;
    out.data[8] = m.data[8] * z;
    out.data[9] = m.data[9] * z;
    out.data[10] = m.data[10] * z;
    out.data[11] = m.data[11] * z;
    out.data[12] = m.data[12];
    out.data[13] = m.data[13];
    out.data[14] = m.data[14];
    out.data[15] = m.data[15];
    return out;
  }

  static rotate(m: Mat4, rad: number, axis: Vec3, out?: Mat4): Mat4 | null {
    out ??= new Mat4();
    let x = axis.data[0],
      y = axis.data[1],
      z = axis.data[2];
    let len = Math.sqrt(x * x + y * y + z * z);
    if (len < 0.000001) return null;
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const t = 1 - c;

    const a00 = m.data[0],
      a01 = m.data[1],
      a02 = m.data[2],
      a03 = m.data[3];
    const a10 = m.data[4],
      a11 = m.data[5],
      a12 = m.data[6],
      a13 = m.data[7];
    const a20 = m.data[8],
      a21 = m.data[9],
      a22 = m.data[10],
      a23 = m.data[11];

    const b00 = x * x * t + c,
      b01 = y * x * t + z * s,
      b02 = z * x * t - y * s;
    const b10 = x * y * t - z * s,
      b11 = y * y * t + c,
      b12 = z * y * t + x * s;
    const b20 = x * z * t + y * s,
      b21 = y * z * t - x * s,
      b22 = z * z * t + c;

    out.data[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out.data[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out.data[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out.data[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out.data[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out.data[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out.data[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out.data[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out.data[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out.data[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out.data[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out.data[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (m !== out) {
      out.data[12] = m.data[12];
      out.data[13] = m.data[13];
      out.data[14] = m.data[14];
      out.data[15] = m.data[15];
    }
    return out;
  }

  static rotateX(m: Mat4, rad: number, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a10 = m.data[4],
      a11 = m.data[5],
      a12 = m.data[6],
      a13 = m.data[7];
    const a20 = m.data[8],
      a21 = m.data[9],
      a22 = m.data[10],
      a23 = m.data[11];

    if (m !== out) {
      out.data[0] = m.data[0];
      out.data[1] = m.data[1];
      out.data[2] = m.data[2];
      out.data[3] = m.data[3];
      out.data[12] = m.data[12];
      out.data[13] = m.data[13];
      out.data[14] = m.data[14];
      out.data[15] = m.data[15];
    }
    out.data[4] = a10 * c + a20 * s;
    out.data[5] = a11 * c + a21 * s;
    out.data[6] = a12 * c + a22 * s;
    out.data[7] = a13 * c + a23 * s;
    out.data[8] = a20 * c - a10 * s;
    out.data[9] = a21 * c - a11 * s;
    out.data[10] = a22 * c - a12 * s;
    out.data[11] = a23 * c - a13 * s;
    return out;
  }

  static rotateY(m: Mat4, rad: number, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = m.data[0],
      a01 = m.data[1],
      a02 = m.data[2],
      a03 = m.data[3];
    const a20 = m.data[8],
      a21 = m.data[9],
      a22 = m.data[10],
      a23 = m.data[11];

    if (m !== out) {
      out.data[4] = m.data[4];
      out.data[5] = m.data[5];
      out.data[6] = m.data[6];
      out.data[7] = m.data[7];
      out.data[12] = m.data[12];
      out.data[13] = m.data[13];
      out.data[14] = m.data[14];
      out.data[15] = m.data[15];
    }
    out.data[0] = a00 * c - a20 * s;
    out.data[1] = a01 * c - a21 * s;
    out.data[2] = a02 * c - a22 * s;
    out.data[3] = a03 * c - a23 * s;
    out.data[8] = a00 * s + a20 * c;
    out.data[9] = a01 * s + a21 * c;
    out.data[10] = a02 * s + a22 * c;
    out.data[11] = a03 * s + a23 * c;
    return out;
  }

  static rotateZ(m: Mat4, rad: number, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const a00 = m.data[0],
      a01 = m.data[1],
      a02 = m.data[2],
      a03 = m.data[3];
    const a10 = m.data[4],
      a11 = m.data[5],
      a12 = m.data[6],
      a13 = m.data[7];

    if (m !== out) {
      out.data[8] = m.data[8];
      out.data[9] = m.data[9];
      out.data[10] = m.data[10];
      out.data[11] = m.data[11];
      out.data[12] = m.data[12];
      out.data[13] = m.data[13];
      out.data[14] = m.data[14];
      out.data[15] = m.data[15];
    }
    out.data[0] = a00 * c + a10 * s;
    out.data[1] = a01 * c + a11 * s;
    out.data[2] = a02 * c + a12 * s;
    out.data[3] = a03 * c + a13 * s;
    out.data[4] = a10 * c - a00 * s;
    out.data[5] = a11 * c - a01 * s;
    out.data[6] = a12 * c - a02 * s;
    out.data[7] = a13 * c - a03 * s;
    return out;
  }

  static fromQuat(q: Quat, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const x = q.data[0],
      y = q.data[1],
      z = q.data[2],
      w = q.data[3];
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      yx = y * x2,
      yy = y * y2;
    const zx = z * x2,
      zy = z * y2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;

    out.data[0] = 1 - yy - zz;
    out.data[1] = yx + wz;
    out.data[2] = zx - wy;
    out.data[3] = 0;
    out.data[4] = yx - wz;
    out.data[5] = 1 - xx - zz;
    out.data[6] = zy + wx;
    out.data[7] = 0;
    out.data[8] = zx + wy;
    out.data[9] = zy - wx;
    out.data[10] = 1 - xx - yy;
    out.data[11] = 0;
    out.data[12] = 0;
    out.data[13] = 0;
    out.data[14] = 0;
    out.data[15] = 1;
    return out;
  }

  static fromRotationTranslationScale(
    q: Quat,
    v: Vec3,
    s: Vec3,
    out?: Mat4,
  ): Mat4 {
    out ??= new Mat4();
    const x = q.data[0],
      y = q.data[1],
      z = q.data[2],
      w = q.data[3];
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    const sx = s.data[0],
      sy = s.data[1],
      sz = s.data[2];

    out.data[0] = (1 - (yy + zz)) * sx;
    out.data[1] = (xy + wz) * sx;
    out.data[2] = (xz - wy) * sx;
    out.data[3] = 0;
    out.data[4] = (xy - wz) * sy;
    out.data[5] = (1 - (xx + zz)) * sy;
    out.data[6] = (yz + wx) * sy;
    out.data[7] = 0;
    out.data[8] = (xz + wy) * sz;
    out.data[9] = (yz - wx) * sz;
    out.data[10] = (1 - (xx + yy)) * sz;
    out.data[11] = 0;
    out.data[12] = v.data[0];
    out.data[13] = v.data[1];
    out.data[14] = v.data[2];
    out.data[15] = 1;
    return out;
  }

  static compose(
    translation: Vec3,
    rotation: Quat,
    scale: Vec3,
    out?: Mat4,
  ): Mat4 {
    return Mat4.fromRotationTranslationScale(rotation, translation, scale, out);
  }

  static fromRotationTranslationScaleOrigin(
    q: Quat,
    v: Vec3,
    s: Vec3,
    o: Vec3,
    out?: Mat4,
  ): Mat4 {
    out ??= new Mat4();
    const x = q.data[0],
      y = q.data[1],
      z = q.data[2],
      w = q.data[3];
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    const sx = s.data[0],
      sy = s.data[1],
      sz = s.data[2];
    const ox = o.data[0],
      oy = o.data[1],
      oz = o.data[2];
    const dx = ox * yy + oz * yz - oy * zz;
    const dy = oy * xx + oz * xz - ox * yz;
    const dz = ox * yz + oy * xz - oz * xx;

    out.data[0] = (1 - (yy + zz)) * sx;
    out.data[1] = (xy + wz) * sx;
    out.data[2] = (xz - wy) * sx;
    out.data[3] = 0;
    out.data[4] = (xy - wz) * sy;
    out.data[5] = (1 - (xx + zz)) * sy;
    out.data[6] = (yz + wx) * sy;
    out.data[7] = 0;
    out.data[8] = (xz + wy) * sz;
    out.data[9] = (yz - wx) * sz;
    out.data[10] = (1 - (xx + yy)) * sz;
    out.data[11] = 0;
    out.data[12] = v.data[0] - dx * sx;
    out.data[13] = v.data[1] - dy * sy;
    out.data[14] = v.data[2] - dz * sz;
    out.data[15] = 1;
    return out;
  }

  static getTranslation(m: Mat4, out?: Vec3): Vec3 {
    out ??= new Vec3();
    out.data[0] = m.data[12];
    out.data[1] = m.data[13];
    out.data[2] = m.data[14];
    return out;
  }

  static getRotation(m: Mat4, out?: Quat): Quat {
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
    let S = 0;

    if (trace > 0) {
      S = Math.sqrt(trace + 1.0) * 2;
      out.data[3] = 0.25 * S;
      out.data[0] = (m21 - m12) / S;
      out.data[1] = (m02 - m20) / S;
      out.data[2] = (m10 - m01) / S;
    } else if (m00 > m11 && m00 > m22) {
      S = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
      out.data[3] = (m21 - m12) / S;
      out.data[0] = 0.25 * S;
      out.data[1] = (m01 + m10) / S;
      out.data[2] = (m02 + m20) / S;
    } else if (m11 > m22) {
      S = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
      out.data[3] = (m02 - m20) / S;
      out.data[0] = (m01 + m10) / S;
      out.data[1] = 0.25 * S;
      out.data[2] = (m12 + m21) / S;
    } else {
      S = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
      out.data[3] = (m10 - m01) / S;
      out.data[0] = (m02 + m20) / S;
      out.data[1] = (m12 + m21) / S;
      out.data[2] = 0.25 * S;
    }
    return out;
  }

  static getScaling(m: Mat4, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const m00 = m.data[0],
      m01 = m.data[1],
      m02 = m.data[2];
    const m10 = m.data[4],
      m11 = m.data[5],
      m12 = m.data[6];
    const m20 = m.data[8],
      m21 = m.data[9],
      m22 = m.data[10];
    out.data[0] = Math.sqrt(m00 * m00 + m01 * m01 + m02 * m02);
    out.data[1] = Math.sqrt(m10 * m10 + m11 * m11 + m12 * m12);
    out.data[2] = Math.sqrt(m20 * m20 + m21 * m21 + m22 * m22);
    return out;
  }

  static perspective(
    fovY: number,
    aspect: number,
    near: number,
    far: number,
    out?: Mat4,
  ): Mat4 {
    out ??= new Mat4();
    const f = 1.0 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    out.data[0] = f / aspect;
    out.data[1] = 0;
    out.data[2] = 0;
    out.data[3] = 0;
    out.data[4] = 0;
    out.data[5] = f;
    out.data[6] = 0;
    out.data[7] = 0;
    out.data[8] = 0;
    out.data[9] = 0;
    out.data[10] = (far + near) * nf;
    out.data[11] = -1;
    out.data[12] = 0;
    out.data[13] = 0;
    out.data[14] = 2 * far * near * nf;
    out.data[15] = 0;
    return out;
  }

  static ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
    out?: Mat4,
  ): Mat4 {
    out ??= new Mat4();
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (far - near);
    out.data[0] = -2 * lr;
    out.data[1] = 0;
    out.data[2] = 0;
    out.data[3] = 0;
    out.data[4] = 0;
    out.data[5] = -2 * bt;
    out.data[6] = 0;
    out.data[7] = 0;
    out.data[8] = 0;
    out.data[9] = 0;
    out.data[10] = nf;
    out.data[11] = 0;
    out.data[12] = (left + right) * lr;
    out.data[13] = (top + bottom) * bt;
    out.data[14] = -near * nf;
    out.data[15] = 1;
    return out;
  }

  static lookAt(eye: Vec3, center: Vec3, up: Vec3, out?: Mat4): Mat4 {
    out ??= new Mat4();
    const eyex = eye.data[0],
      eyey = eye.data[1],
      eyez = eye.data[2];
    const centerx = center.data[0],
      centery = center.data[1],
      centerz = center.data[2];
    const upx = up.data[0],
      upy = up.data[1],
      upz = up.data[2];

    let z0 = eyex - centerx;
    let z1 = eyey - centery;
    let z2 = eyez - centerz;
    let len = z0 * z0 + z1 * z1 + z2 * z2;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
      z0 *= len;
      z1 *= len;
      z2 *= len;
    }

    let x0 = upy * z2 - upz * z1;
    let x1 = upz * z0 - upx * z2;
    let x2 = upx * z1 - upy * z0;
    len = x0 * x0 + x1 * x1 + x2 * x2;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    out.data[0] = x0;
    out.data[1] = y0;
    out.data[2] = z0;
    out.data[3] = 0;
    out.data[4] = x1;
    out.data[5] = y1;
    out.data[6] = z1;
    out.data[7] = 0;
    out.data[8] = x2;
    out.data[9] = y2;
    out.data[10] = z2;
    out.data[11] = 0;
    out.data[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out.data[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out.data[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out.data[15] = 1;
    return out;
  }

  static transformVec3(m: Mat4, v: Vec3, out?: Vec3): Vec3 {
    out ??= new Vec3();
    const x = v.data[0],
      y = v.data[1],
      z = v.data[2];
    const w = m.data[3] * x + m.data[7] * y + m.data[11] * z + m.data[15] || 1.0;
    out.data[0] = (m.data[0] * x + m.data[4] * y + m.data[8] * z + m.data[12]) / w;
    out.data[1] = (m.data[1] * x + m.data[5] * y + m.data[9] * z + m.data[13]) / w;
    out.data[2] = (m.data[2] * x + m.data[6] * y + m.data[10] * z + m.data[14]) / w;
    return out;
  }

  static getFrustumCorners(viewProjectionMatrix: Mat4, out?: Vec3[]): Vec3[] {
    out ??= [];
    
    const cornersNDC = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];

    for (let i = 0; i < 8; i++) {
      const x = cornersNDC[i][0];
      const y = cornersNDC[i][1];
      const z = cornersNDC[i][2];
      
      const w = viewProjectionMatrix.data[3] * x + viewProjectionMatrix.data[7] * y + viewProjectionMatrix.data[11] * z + viewProjectionMatrix.data[15];
      const px = (viewProjectionMatrix.data[0] * x + viewProjectionMatrix.data[4] * y + viewProjectionMatrix.data[8] * z + viewProjectionMatrix.data[12]) / w;
      const py = (viewProjectionMatrix.data[1] * x + viewProjectionMatrix.data[5] * y + viewProjectionMatrix.data[9] * z + viewProjectionMatrix.data[13]) / w;
      const pz = (viewProjectionMatrix.data[2] * x + viewProjectionMatrix.data[6] * y + viewProjectionMatrix.data[10] * z + viewProjectionMatrix.data[14]) / w;
      
      if (out[i]) {
        out[i].data[0] = px;
        out[i].data[1] = py;
        out[i].data[2] = pz;
      } else {
        out[i] = new Vec3(px, py, pz);
      }
    }
    
    return out;
  }
}
