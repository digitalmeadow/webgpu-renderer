import { MeshUniforms } from "./MeshUniforms";
import { BaseMaterial } from "../materials/BaseMaterial";
import { Entity } from "./Entity";
import { Geometry } from "../geometries/Geometry";

export class Mesh extends Entity {
  public geometry: Geometry;
  public uniforms: MeshUniforms;
  public material: BaseMaterial | null = null;

  constructor(
    device: GPUDevice,
    name: string,
    geometry: Geometry,
    material: BaseMaterial,
  ) {
    super(name);
    this.uniforms = new MeshUniforms(device);
    this.geometry = geometry;
    this.material = material;
  }
}
