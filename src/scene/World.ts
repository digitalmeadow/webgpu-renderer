import { Scene } from "./Scene";

export class World {
  scenes: Scene[] = [];
  private _needsMatrixUpdate: boolean = true;
  private _sceneVersion: number = 0;

  constructor() {}

  addScene(scene: Scene): void {
    this.scenes.push(scene);
    this._needsMatrixUpdate = true;
    this._sceneVersion++;
  }

  removeScene(scene: Scene): void {
    const index = this.scenes.indexOf(scene);
    if (index !== -1) {
      this.scenes.splice(index, 1);
      this._sceneVersion++;
      this._needsMatrixUpdate = true;
    }
  }

  get sceneVersion(): number {
    let totalVersion = this._sceneVersion;
    for (const scene of this.scenes) {
      totalVersion += scene.version;
    }
    return totalVersion;
  }

  markSceneChanged(): void {
    this._sceneVersion++;
  }

  step(deltaTime: number): void {
    for (const scene of this.scenes) {
      scene.update(deltaTime);
    }
  }

  updateWorldMatrices(): void {
    for (const scene of this.scenes) {
      scene.root.updateWorldMatrix();
    }
    this._needsMatrixUpdate = false;
  }

  markNeedsMatrixUpdate(): void {
    this._needsMatrixUpdate = true;
  }

  get needsMatrixUpdate(): boolean {
    return this._needsMatrixUpdate;
  }

  destroy(): void {
    for (const scene of this.scenes) {
      this.removeScene(scene);
    }
  }
}
