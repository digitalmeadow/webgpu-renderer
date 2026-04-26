import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

interface MaterialCustomOptions {
  name: string;
  passes?: {
    geometry?: string;
    forward?: string;
  };
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  opacity?: number;
  doubleSided?: boolean;
}

export class MaterialCustom extends MaterialBase {
  readonly type = MaterialType.Custom;
  passes: { geometry?: string; forward?: string } = {};
  public uniforms: MaterialUniforms;

  constructor(device: GPUDevice, name: string, options: MaterialCustomOptions) {
    super(name, options);
    this.passes = options.passes ?? {};
    this.specialization.isCustom = true;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
