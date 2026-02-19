import { MaterialUniforms } from "../MaterialUniforms";
import { Texture } from "../Texture";
import { AlphaMode, BaseMaterial } from "./BaseMaterial";

interface MaterialStandardOptions {
  albedoTexture?: Texture | null;
  normalTexture?: Texture | null;
  metalnessRoughnessTexture?: Texture | null;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
}

export class MaterialStandard extends BaseMaterial {
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;
  public uniforms: MaterialUniforms;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialStandardOptions,
  ) {
    super(name, options);
    this.albedoTexture = options.albedoTexture ?? null;
    this.normalTexture = options.normalTexture ?? null;
    this.metalnessRoughnessTexture = options.metalnessRoughnessTexture ?? null;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
