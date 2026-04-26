import { Transform } from "./Transform";

export const EntityType = {
  Camera: "camera",
  Mesh: "mesh",
  Group: "group",
  ParticleEmitter: "particleEmitter",
  LightDirectional: "lightDirectional",
  LightSpot: "lightSpot",
  LightPoint: "lightPoint",
  ReflectionProbe: "reflectionProbe",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export abstract class Entity {
  abstract readonly type: EntityType;
  name: string;
  transform: Transform;
  enabled: boolean = true;
  needsUpdate: boolean = false;

  constructor(name: string = "Entity") {
    this.name = name;
    this.transform = new Transform();
  }

  update?(deltaTime?: number): void;
}

export class GroupEntity extends Entity {
  readonly type = EntityType.Group;

  constructor(name: string = "Group") {
    super(name);
  }

  addChild(entity: { transform: Transform }): void {
    this.transform.addChild(entity.transform);
  }
}
