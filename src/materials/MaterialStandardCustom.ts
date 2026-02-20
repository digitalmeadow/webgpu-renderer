import { MaterialBase } from "./MaterialBase";
import { AlphaMode } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

export interface ShaderHooks {
  uniforms?: string;
  albedo?: string;
  vertex_post_process?: string;
  albedo_logic?: string;
  metal_rough_logic?: string;
}

export interface MaterialStandardCustomOptions extends ShaderHooks {
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
}

export class MaterialStandardCustom extends MaterialBase {
  public hooks: ShaderHooks = {};
  public customUniforms: Record<string, any> = {};
  public uniforms: MaterialUniforms;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialStandardCustomOptions,
  ) {
    super(name, options);
    this.hooks = options;
    this.specialization.isCustom = true;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
