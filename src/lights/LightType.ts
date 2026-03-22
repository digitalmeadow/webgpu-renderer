export const LightType = {
  Directional: "directional",
  Spot: "spot",
} as const;
export type LightType = (typeof LightType)[keyof typeof LightType];
