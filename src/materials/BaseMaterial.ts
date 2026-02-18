import { Texture } from "../Texture";

export enum AlphaMode {
  Opaque = "OPAQUE",
  Mask = "MASK",
  Blend = "BLEND",
}

export interface MaterialSpecialization {
  isCustom?: boolean;
}

export abstract class BaseMaterial {
  name: string;
  alphaMode: AlphaMode = AlphaMode.Opaque;
  alphaCutoff: number = 0.5;
  doubleSided: boolean = false;
  opacity: number = 1.0;
  specialization: MaterialSpecialization = {};

  constructor(
    name: string,
    options?: {
      alphaMode?: AlphaMode;
      alphaCutoff?: number;
      doubleSided?: boolean;
      opacity?: number;
    },
  ) {
    this.name = name;
    if (options) {
      this.alphaMode = options.alphaMode ?? this.alphaMode;
      this.alphaCutoff = options.alphaCutoff ?? this.alphaCutoff;
      this.doubleSided = options.doubleSided ?? this.doubleSided;
      this.opacity = options.opacity ?? this.opacity;
    }
  }
}
