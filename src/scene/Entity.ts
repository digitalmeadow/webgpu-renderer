import { LightType } from "../lights";
import { Transform } from "./Transform";

export const EntityType = {
  Mesh: "mesh",
  ParticleEmitter: "particleEmitter",
  ...LightType,
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export abstract class Entity {
  type?: EntityType;
  name: string;
  transform: Transform;
  enabled: boolean = true;

  constructor(name: string = "Entity") {
    this.name = name;
    this.transform = new Transform();
  }

  update(deltaTime?: number): void {}
}
