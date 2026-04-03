import { Scene } from "./Scene";

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

  update(deltaTime: number): void {
    for (const scene of this.scenes) {
      scene.update(deltaTime);
    }
  }

  updateWorldMatrices(): void {
    for (const scene of this.scenes) {
      scene.root.updateWorldMatrix();
    }
  }

  destroy(): void {
    for (const scene of this.scenes) {
      this.removeScene(scene);
    }
  }
}
