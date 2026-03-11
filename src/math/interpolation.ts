export function mapRange(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
): number {
  if (fromMax === fromMin) {
    return toMin;
  }
  return toMin + ((value - fromMin) * (toMax - toMin)) / (fromMax - fromMin);
}

export function lerp(a: number, b: number, t: number): number {
  return mapRange(t, 0, 1, a, b);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function rateIndependentLerpingFactor(
  decayRate: number,
  deltaTime: number,
): number {
  return 1.0 - Math.exp(-decayRate * deltaTime);
}

export function lerpValue(a: number, b: number, factor: number): number {
  return a + (b - a) * factor;
}
