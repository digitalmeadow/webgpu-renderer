import { Texture } from "./Texture";

export class Material {
  albedoTexture: Texture | null = null;
  color: [number, number, number, number] = [1, 1, 1, 1];

  constructor(albedoTexture: Texture | null = null) {
    this.albedoTexture = albedoTexture;
  }
}
