import { MaterialBase, AlphaMode, RenderPass } from "./MaterialBase";
import { Texture } from "../textures";
import { MaterialUniforms } from "./MaterialUniforms";

export interface ShaderHooks {
  uniforms?: string;
  albedo?: string;
  vertex_post_process?: string;
  albedo_logic?: string;
  metal_rough_logic?: string;
}

interface MaterialPBROptions {
  albedoTexture?: Texture | null;
  normalTexture?: Texture | null;
  metalnessRoughnessTexture?: Texture | null;
  renderPass?: RenderPass;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
  hooks?: ShaderHooks;
}

export class MaterialPBR extends MaterialBase {
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;
  hooks: ShaderHooks = {};
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
    this.hooks = options.hooks ?? {};
    this.uniforms = new MaterialUniforms(device, this);
  }
}
