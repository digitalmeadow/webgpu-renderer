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
