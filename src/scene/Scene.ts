import { Transform } from "./Transform";
import { Entity, EntityType } from "./Entity";
import { Light } from "../lights";
import { AnimationManager } from "../animations";

export class Scene {
  name: string;
  root: Transform;
  entities: Entity[] = [];
  lights: Light[] = [];
  animationManager: AnimationManager;
  private _version: number = 0;

  constructor(name: string = "Scene") {
    this.name = name;
    this.root = new Transform();
    this.animationManager = new AnimationManager();
  }

  get version(): number {
    return this._version;
  }

  private isLight(entity: Entity): boolean {
    return (
      entity.type === EntityType.LightDirectional ||
      entity.type === EntityType.LightSpot ||
      entity.type === EntityType.LightPoint
    );
  }

  add(entity: Entity): void {
    const wasAlreadyAdded = this.entities.includes(entity);
    if (!wasAlreadyAdded) {
      this.entities.push(entity);
      this._version++;
      console.log(
        `[Scene.add] Added ${entity.type} "${entity.name}", version: ${this._version}, total entities: ${this.entities.length}`,
      );
    } else {
      console.log(
        `[Scene.add] Entity ${entity.type} "${entity.name}" already in scene`,
      );
    }
    if (!entity.transform.parent) {
      this.root.addChild(entity.transform);
    }
    if (this.isLight(entity) && !this.lights.includes(entity as Light)) {
      this.lights.push(entity as Light);
      console.log(
        `[Scene.add] Added light to lights array, total lights: ${this.lights.length}`,
      );
    }
  }

  remove(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      this.entities.splice(index, 1);
      entity.transform.remove();
      this._version++;
    }
    if (this.isLight(entity)) {
      const lightIndex = this.lights.indexOf(entity as Light);
      if (lightIndex !== -1) {
        this.lights.splice(lightIndex, 1);
      }
    }
  }

  update(deltaTime: number): void {
    // Always update animations (they manage their own active state)
    this.animationManager.update(deltaTime);

    // Always update world matrices (uses dirty tracking internally)
    this.root.updateWorldMatrix();

    // Only update entities that require per-frame updates
    for (const entity of this.entities) {
      if (entity.enabled && entity.requiresUpdate) {
        entity.update(deltaTime);
      }
    }
  }
}
