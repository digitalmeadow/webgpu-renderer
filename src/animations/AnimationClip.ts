import { AnimationCurve } from "./AnimationCurve";

export class AnimationClip {
  name: string;
  curves: AnimationCurve[] = [];
  duration: number = 0;

  constructor(name: string = "AnimationClip") {
    this.name = name;
  }

  addCurve(curve: AnimationCurve) {
    this.curves.push(curve);
    if (curve.timestamps.length <= 0) return;

    const duration = curve.timestamps[curve.timestamps.length - 1];
    this.duration = Math.max(this.duration, duration);
  }
}
