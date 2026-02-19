export class Time {
  private previous: number;
  public delta: number;
  public elapsed: number;

  constructor() {
    const now = performance.now();
    this.previous = now;
    this.delta = 0;
    this.elapsed = 0;
  }

  update(): void {
    const currentTime = performance.now();
    this.delta = (currentTime - this.previous) / 1000;
    this.elapsed += this.delta;
    this.previous = currentTime;
  }
}
