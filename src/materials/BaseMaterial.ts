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
  doubleSided: boolean = false;
  specialization: MaterialSpecialization = {};

  constructor(name: string) {
    this.name = name;
  }
}
