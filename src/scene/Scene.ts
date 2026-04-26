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
    }
    if (!entity.transform.parent) {
      this.root.addChild(entity.transform);
    }
    if (this.isLight(entity) && !this.lights.includes(entity as Light)) {
      this.lights.push(entity as Light);
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

    // Only update entities that require per-frame updates
    for (const entity of this.entities) {
      if (entity.enabled && entity.needsUpdate) {
        entity.update?.(deltaTime);
      }
    }
  }
}
