const MAX_DELTA = 1 / 15;

export class Time {
  private _previous = 0;
  private _firstFrame = true;
  private _delta = 0;
  private _elapsed = 0;

  public timeScale = 1;

  public get delta(): number {
    return this._delta;
  }
  public get elapsed(): number {
    return this._elapsed;
  }

  update(): void {
    const now = performance.now();
    if (this._firstFrame) {
      this._previous = now;
      this._firstFrame = false;
      return;
    }
    const raw = (now - this._previous) / 1000;
    this._delta = Math.min(raw, MAX_DELTA) * this.timeScale;
    this._elapsed += this._delta;
    this._previous = now;
  }
}
