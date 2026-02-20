import { MaterialBase, RenderPass } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

export interface ShaderHooks {
  albedo?: string;
  uniforms?: string;
}

interface MaterialBasicOptions {
  color?: [number, number, number, number];
  renderPass?: RenderPass;
  alphaMode?: "opaque" | "blend" | "mask";
  opacity?: number;
  doubleSided?: boolean;
  hooks?: ShaderHooks;
}

export class MaterialBasic extends MaterialBase {
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
    
    if (!this.hooks.albedo) {
      this.hooks.albedo = `fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
        return material_albedo_color();
      }`;
    }
    
    if (!this.hooks.uniforms) {
      this.hooks.uniforms = `fn material_albedo_color() -> vec4<f32> { 
        return vec4<f32>(material.color.rgb, material.color.a); 
      }`;
    }
    
    this.uniforms = new MaterialUniforms(device, this);
  }
}
