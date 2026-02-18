import { Transform } from "./Transform";
import { Vec3 } from "./math";

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

export class World {
  scenes: Scene[] = [];
  ambientLightColor: Vec3 = new Vec3(0.05, 0.05, 0.05);

  constructor() {}

  addScene(scene: Scene): void {
    this.scenes.push(scene);
  }

  removeScene(scene: Scene): void {
    const index = this.scenes.indexOf(scene);
    if (index !== -1) {
      this.scenes.splice(index, 1);
    }
  }

  update(): void {
    for (const scene of this.scenes) {
      scene.update();
    }
  }

  destroy(): void {
    for (const scene of this.scenes) {
      this.removeScene(scene);
    }
  }
}
