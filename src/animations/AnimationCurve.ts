import { Transform } from "../scene";
import { Vec3, Quat } from "../math";

export type AnimationPath = "translation" | "rotation" | "scale" | "weights";
export type AnimationInterpolation = "LINEAR" | "STEP" | "CUBICSPLINE";

export class AnimationCurve {
  target: Transform;
  path: AnimationPath;
  timestamps: Float32Array;
  keyframes: Float32Array;
  interpolation: AnimationInterpolation;

  // Temporary objects to avoid allocations during lerp
  private _valA_v3 = new Vec3();
  private _valB_v3 = new Vec3();
  private _valA_q = new Quat();
  private _valB_q = new Quat();

  constructor(
    target: Transform,
    path: AnimationPath,
    timestamps: Float32Array,
    keyframes: Float32Array,
    interpolation: AnimationInterpolation = "LINEAR",
  ) {
    this.target = target;
    this.path = path;
    this.timestamps = timestamps;
    this.keyframes = keyframes;
    this.interpolation = interpolation;
  }

  evaluate(time: number) {
    if (this.timestamps.length === 0) return;

    if (time <= this.timestamps[0]) {
      this.applyKeyframe(0, 0);
      return;
    }
    const lastIdx = this.timestamps.length - 1;
    if (time >= this.timestamps[lastIdx]) {
      this.applyKeyframe(lastIdx, 1);
      return;
    }

    let prevIndex = 0;
    let nextIndex = 1;
    for (let i = 0; i < this.timestamps.length; i++) {
      if (time < this.timestamps[i]) {
        nextIndex = i;
        prevIndex = i - 1;
        break;
      }
    }

    const t0 = this.timestamps[prevIndex];
    const t1 = this.timestamps[nextIndex];
    let factor = (time - t0) / (t1 - t0);

    if (this.interpolation === "STEP") {
      factor = 0;
    } else if (this.interpolation === "CUBICSPLINE") {
      // TODO
      return;
    }

    this.interpolateKeyframes(prevIndex, nextIndex, factor);
  }

  private applyKeyframe(index: number, factor: number) {
    this.interpolateKeyframes(index, index, factor);
  }

  private interpolateKeyframes(idx0: number, idx1: number, factor: number) {
    if (this.path === "translation" || this.path === "scale") {
      const stride = 3;
      const offset0 = idx0 * stride;
      const offset1 = idx1 * stride;

      this._valA_v3.set(
        this.keyframes[offset0],
        this.keyframes[offset0 + 1],
        this.keyframes[offset0 + 2],
      );
      this._valB_v3.set(
        this.keyframes[offset1],
        this.keyframes[offset1 + 1],
        this.keyframes[offset1 + 2],
      );

      Vec3.lerp(this._valA_v3, this._valB_v3, factor, this._valA_v3);

      if (this.path === "translation") {
        this.target.setPosition(
          this._valA_v3.x,
          this._valA_v3.y,
          this._valA_v3.z,
        );
      }

      if (this.path === "scale") {
        this.target.setScale(this._valA_v3.x, this._valA_v3.y, this._valA_v3.z);
      }
    }

    if (this.path === "rotation") {
      const stride = 4;
      const offset0 = idx0 * stride;
      const offset1 = idx1 * stride;

      this._valA_q.set(
        this.keyframes[offset0],
        this.keyframes[offset0 + 1],
        this.keyframes[offset0 + 2],
        this.keyframes[offset0 + 3],
      );
      this._valB_q.set(
        this.keyframes[offset1],
        this.keyframes[offset1 + 1],
        this.keyframes[offset1 + 2],
        this.keyframes[offset1 + 3],
      );

      Quat.slerp(this._valA_q, this._valB_q, factor, this._valA_q);

      this.target.setRotationQuat(
        this._valA_q.x,
        this._valA_q.y,
        this._valA_q.z,
        this._valA_q.w,
      );
    }
  }
}
