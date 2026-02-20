export type AlphaMode = "opaque" | "blend" | "mask";
export type RenderPass = "geometry" | "forward";

export interface MaterialSpecialization {
  isCustom?: boolean;
}

export abstract class MaterialBase {
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
