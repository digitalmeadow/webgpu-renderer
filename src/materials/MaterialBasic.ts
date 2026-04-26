import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";
import { ShaderHooks } from "./ShaderHooks";

const DEFAULT_ALBEDO_HOOK = `fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
  return material_albedo_color();
}`;

const DEFAULT_UNIFORMS_HOOK = `fn material_albedo_color() -> vec4<f32> {
  return vec4<f32>(material.color.rgb, material.color.a);
}`;

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
    this.hooks = {
      albedo: DEFAULT_ALBEDO_HOOK,
      uniforms: DEFAULT_UNIFORMS_HOOK,
      ...options.hooks,
    };
    this.uniforms = new MaterialUniforms(device, this);
  }
}
