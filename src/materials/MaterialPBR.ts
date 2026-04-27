import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";
import { Texture, CubeTexture, CubeRenderTarget } from "../textures";
import { MaterialUniforms } from "./MaterialUniforms";
import { ShaderHooks } from "./ShaderHooks";

interface MaterialPBROptions {
  albedoTexture?: Texture | null;
  normalTexture?: Texture | null;
  metalnessRoughnessTexture?: Texture | null;
  environmentTexture?: CubeTexture | CubeRenderTarget | null;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
  hooks?: ShaderHooks;
  emissiveTexture?: Texture | null;
  emissiveFactor?: [number, number, number];
  emissiveIntensity?: number;
  baseColorFactor?: [number, number, number, number];
}

export class MaterialPBR extends MaterialBase {
  readonly type = MaterialType.PBR;
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;
  environmentTexture: CubeTexture | CubeRenderTarget | null = null;
  environmentTextureId: number = 0; // 0 = global skybox, 1+ = custom environment maps
  hooks: ShaderHooks = {};
  public uniforms: MaterialUniforms;
  baseColorFactor: [number, number, number, number] = [1, 1, 1, 1];
  emissiveTexture: Texture | null = null;
  emissiveFactor: [number, number, number] = [0, 0, 0];
  emissiveIntensity: number = 0.0;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialPBROptions = {},
  ) {
    super(name, options);
    this.albedoTexture = options.albedoTexture ?? null;
    this.normalTexture = options.normalTexture ?? null;
    this.metalnessRoughnessTexture = options.metalnessRoughnessTexture ?? null;
    this.environmentTexture = options.environmentTexture ?? null;
    this.hooks = options.hooks ?? {};
    this.emissiveTexture = options.emissiveTexture ?? null;
    this.emissiveFactor = options.emissiveFactor ?? [0, 0, 0];
    this.emissiveIntensity = options.emissiveIntensity ?? 0.0;
    this.baseColorFactor = options.baseColorFactor ?? [1, 1, 1, 1];
    this.uniforms = new MaterialUniforms(device, this);
  }

  get hasHooks(): boolean {
    return !!(
      this.hooks.uniforms ||
      this.hooks.functions ||
      this.hooks.albedo ||
      this.hooks.albedo_logic ||
      this.hooks.vertex_post_process
    );
  }
}
