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
