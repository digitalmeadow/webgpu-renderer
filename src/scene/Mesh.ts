import { MaterialBase } from "../materials";
import { MeshUniforms } from "./MeshUniforms";
import { Entity } from "./Entity";
import { Geometry } from "../geometries";

export class Mesh extends Entity {
  public geometry: Geometry;
  public uniforms: MeshUniforms;
  public material: MaterialBase | null = null;

  constructor(
    device: GPUDevice,
    name: string,
    geometry: Geometry,
    material: MaterialBase,
  ) {
    super(name);
    this.uniforms = new MeshUniforms(device);
    this.geometry = geometry;
    this.material = material;
  }
}
