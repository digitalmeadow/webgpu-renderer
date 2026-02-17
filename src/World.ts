import { Transform } from "./Transform";

export abstract class Entity {
  name: string;
  transform: Transform;
  enabled: boolean = true;

  constructor(name: string = "Entity") {
    this.name = name;
    this.transform = new Transform();
  }

  update(): void {}
}

export class Scene {
  name: string;
  root: Transform;
  entities: Entity[] = [];

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Transform();
  }

  add(entity: Entity): void {
    this.entities.push(entity);
    this.root.addChild(entity.transform);
  }

  remove(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
      entity.transform.remove();
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
