import { AnimationClip } from "./AnimationClip";

export class AnimationController {
  clip: AnimationClip;
  playhead: number = 0;
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
    this.playhead = 0;
    this.evaluate();
  }

  update(deltaTime: number) {
    if (!this.playing) return;

    this.playhead += deltaTime * this.speed;

    if (this.playhead > this.clip.duration) {
      if (this.loop) {
        this.playhead = this.playhead % this.clip.duration;
      } else {
        this.playhead = this.clip.duration;
        this.playing = false;
      }
    } else if (this.playhead < 0) {
      if (this.loop) {
        this.playhead =
          this.clip.duration - (Math.abs(this.playhead) % this.clip.duration);
      } else {
        this.playhead = 0;
        this.playing = false;
      }
    }

    this.evaluate();
  }

  private evaluate() {
    for (const curve of this.clip.curves) {
      curve.evaluate(this.playhead);
    }
  }
}
