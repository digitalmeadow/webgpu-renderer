import { MaterialBase, RenderPass } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

export interface ShaderHooks {
  albedo?: string;
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
    this.uniforms = new MaterialUniforms(device, this);
  }
}
