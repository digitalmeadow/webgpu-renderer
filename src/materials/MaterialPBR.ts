import { MaterialBase } from "./MaterialBase";
import { Texture } from "../textures";
import { AlphaMode } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

interface MaterialPBROptions {
  albedoTexture?: Texture | null;
  normalTexture?: Texture | null;
  metalnessRoughnessTexture?: Texture | null;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
}

export class MaterialPBR extends MaterialBase {
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;
  public uniforms: MaterialUniforms;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialPBROptions = {},
  ) {
    super(name, options);
    this.albedoTexture = options.albedoTexture ?? null;
    this.normalTexture = options.normalTexture ?? null;
    this.metalnessRoughnessTexture = options.metalnessRoughnessTexture ?? null;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
