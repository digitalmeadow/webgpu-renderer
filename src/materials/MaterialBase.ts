export type AlphaMode = "opaque" | "blend" | "mask";
export type RenderPass = "geometry" | "forward";

export const MaterialType = {
  Base: "materialBase",
  Basic: "materialBasic",
  PBR: "materialPBR",
  Custom: "materialCustom",
  Particle: "materialParticle",
} as const;
export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType];

export interface MaterialSpecialization {
  isCustom?: boolean;
}

export abstract class MaterialBase {
  abstract readonly type: MaterialType;
  name: string;
  renderPass: RenderPass = "geometry";
  alphaMode: AlphaMode = "opaque";
  alphaCutoff: number = 0.5;
  doubleSided: boolean = false;
  opacity: number = 1.0;
  specialization: MaterialSpecialization = {};

  constructor(
    name: string,
    options?: {
      renderPass?: RenderPass;
      alphaMode?: AlphaMode;
      alphaCutoff?: number;
      doubleSided?: boolean;
      opacity?: number;
    },
  ) {
    this.name = name;
    if (options) {
      this.renderPass = options.renderPass ?? this.renderPass;
      this.alphaMode = options.alphaMode ?? this.alphaMode;
      this.alphaCutoff = options.alphaCutoff ?? this.alphaCutoff;
      this.doubleSided = options.doubleSided ?? this.doubleSided;
      this.opacity = options.opacity ?? this.opacity;
    }
  }
}
