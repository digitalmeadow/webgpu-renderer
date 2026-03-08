import { AnimationClip } from "./AnimationClip";

export class AnimationController {
  clip: AnimationClip;
  currentTime: number = 0;
  playing: boolean = true;
  loop: boolean = true;
  speed: number = 1;

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  play() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  stop() {
    this.playing = false;
    this.currentTime = 0;
    this.evaluate();
  }

  update(deltaTime: number) {
    if (!this.playing) return;

    this.currentTime += deltaTime * this.speed;

    if (this.currentTime > this.clip.duration) {
      if (this.loop) {
        this.currentTime = this.currentTime % this.clip.duration;
      } else {
        this.currentTime = this.clip.duration;
        this.playing = false;
      }
    } else if (this.currentTime < 0) {
      if (this.loop) {
        this.currentTime =
          this.clip.duration -
          (Math.abs(this.currentTime) % this.clip.duration);
      } else {
        this.currentTime = 0;
        this.playing = false;
      }
    }

    this.evaluate();
  }

  private evaluate() {
    for (const curve of this.clip.curves) {
      curve.evaluate(this.currentTime);
    }
  }
}
