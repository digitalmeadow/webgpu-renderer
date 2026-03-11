import { Transform } from "./Transform";

export const ENTITY_TYPE = Symbol("entityType");

export type EntityType = "mesh" | "particle";

export abstract class Entity {
  name: string;
  transform: Transform;
  enabled: boolean = true;
  [ENTITY_TYPE]?: EntityType;

  constructor(name: string = "Entity") {
    this.name = name;
    this.transform = new Transform();
  }

  update(deltaTime?: number): void {}
}
