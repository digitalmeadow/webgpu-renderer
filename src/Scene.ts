import { Transform } from "./Transform";
import { Entity } from "./Entity";
import type { Light } from "./lights";
import { isLight } from "./lights/Light";

export class Scene {
  name: string;
  root: Transform;
  entities: Entity[] = [];
  lights: Light[] = [];

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Transform();
  }

  add(entity: Entity): void {
    this.entities.push(entity);
    this.root.addChild(entity.transform);
    if (isLight(entity)) {
      this.lights.push(entity);
    }
  }

  remove(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
      entity.transform.remove();
    }

    if (isLight(entity)) {
      const lightIndex = this.lights.indexOf(entity);
      if (lightIndex !== -1) {
        this.lights.splice(lightIndex, 1);
      }
    }
  }

  update(): void {
    this.root.updateWorldMatrix();
    for (const entity of this.entities) {
      if (entity.enabled) {
        entity.update();
      }
    }
  }
}
