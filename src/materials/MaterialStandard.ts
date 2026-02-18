import { Texture } from "../Texture";
import { BaseMaterial } from "./BaseMaterial";

interface MaterialStandardOptions {
  albedoTexture?: Texture | null;
  normalTexture?: Texture | null;
  metalnessRoughnessTexture?: Texture | null;
}

export class MaterialStandard extends BaseMaterial {
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;

  constructor(name: string, options: MaterialStandardOptions) {
    super(name);
    this.albedoTexture = options.albedoTexture ?? null;
    this.normalTexture = options.normalTexture ?? null;
    this.metalnessRoughnessTexture = options.metalnessRoughnessTexture ?? null;
  }
}
