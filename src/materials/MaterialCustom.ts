import { BaseMaterial } from "./BaseMaterial";

export interface ShaderHooks {
  uniforms?: string;
  albedo?: string;
  vertex_post_process?: string;
  albedo_logic?: string;
  metal_rough_logic?: string;
}

export class MaterialCustom extends BaseMaterial {
  public hooks: ShaderHooks = {};
  public uniforms: Record<string, any> = {};

  constructor(name: string, hooks: ShaderHooks) {
    super(name);
    this.hooks = hooks;
    this.specialization.isCustom = true;
  }
}
