import { Scene } from "./Scene";
import { Vec3 } from "../math";

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
