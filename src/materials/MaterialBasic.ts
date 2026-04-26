import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";
import { ShaderHooks } from "./ShaderHooks";

interface MaterialBasicOptions {
  color?: [number, number, number, number];
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  opacity?: number;
  doubleSided?: boolean;
  hooks?: ShaderHooks;
}

export class MaterialBasic extends MaterialBase {
  readonly type = MaterialType.Basic;
  color: [number, number, number, number] = [1, 1, 1, 1];
  hooks: ShaderHooks = {};
  public uniforms: MaterialUniforms;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialBasicOptions = {},
  ) {
    super(name, options);
    this.color = options.color ?? [1, 1, 1, 1];
    this.hooks = options.hooks ?? {};
    this.uniforms = new MaterialUniforms(device, this);
  }

  get hasHooks(): boolean {
    return !!(
      this.hooks.uniforms ||
      this.hooks.albedo ||
      this.hooks.albedo_logic ||
      this.hooks.vertex_post_process
    );
  }
}
