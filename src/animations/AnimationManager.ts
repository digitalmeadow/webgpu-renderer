import { AnimationController } from "./AnimationController";

export class AnimationManager {
  controllers: AnimationController[] = [];

  constructor() {}

  add(controller: AnimationController) {
    if (!this.controllers.includes(controller)) {
      this.controllers.push(controller);
    }
  }

  remove(controller: AnimationController) {
    const index = this.controllers.indexOf(controller);
    if (index !== -1) {
      this.controllers.splice(index, 1);
    }
  }

  update(deltaTime: number) {
    for (const controller of this.controllers) {
      controller.update(deltaTime);
    }
  }
}
