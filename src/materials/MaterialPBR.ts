import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";
import { Texture, CubeTexture } from "../textures";
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
  environmentTexture?: CubeTexture | null;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  opacity?: number;
  hooks?: ShaderHooks;
  emissiveTexture?: Texture | null;
  emissiveFactor?: [number, number, number];
}

export class MaterialPBR extends MaterialBase {
  readonly type = MaterialType.PBR;
  albedoTexture: Texture | null = null;
  normalTexture: Texture | null = null;
  metalnessRoughnessTexture: Texture | null = null;
  environmentTexture: CubeTexture | null = null;
  hooks: ShaderHooks = {};
  public uniforms: MaterialUniforms;
  baseColorFactor: [number, number, number, number] = [1, 1, 1, 1];
  emissiveTexture: Texture | null = null;
  emissiveFactor: [number, number, number] = [0, 0, 0];

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
    this.uniforms = new MaterialUniforms(device, this);
  }
}
