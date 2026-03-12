export const LightType = {
  Directional: "directional",
  Point: "point",
  Spot: "spot",
} as const;
export type LightType = (typeof LightType)[keyof typeof LightType];
