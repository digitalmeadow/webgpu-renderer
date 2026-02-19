import { MaterialUniforms } from "../MaterialUniforms";
import { AlphaMode, BaseMaterial } from "./BaseMaterial";

export interface ShaderHooks {
  uniforms?: string;
  albedo?: string;
  vertex_post_process?: string;
  albedo_logic?: string;
  metal_rough_logic?: string;
}

export interface MaterialCustomOptions extends ShaderHooks {
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
}

export class MaterialCustom extends BaseMaterial {
  public hooks: ShaderHooks = {};
  public customUniforms: Record<string, any> = {};
  public uniforms: MaterialUniforms;

  constructor(device: GPUDevice, name: string, options: MaterialCustomOptions) {
    super(name, options);
    this.hooks = options;
    this.specialization.isCustom = true;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
