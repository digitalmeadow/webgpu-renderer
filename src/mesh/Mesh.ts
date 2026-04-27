import { MaterialBase } from "../materials";
import { MeshUniforms } from "./MeshUniforms";
import { Entity, EntityType } from "../scene/Entity";
import { Geometry } from "../geometries";
import { Mat4, AABBWorld } from "../math";
import { SkinData, MAX_JOINTS } from "../skinning";
import { InstanceData, DEFAULT_INSTANCE_DATA } from "../scene/InstanceData";

export class Mesh extends Entity {
  readonly type = EntityType.Mesh;
  public geometry: Geometry;
  // Uniforms kept for skinning; not used in instanced rendering
  // TODO: skinning support for instanced rendering
  public uniforms: MeshUniforms;
  public material: MaterialBase | null = null;
  public skinData: SkinData | null = null;
  public billboard: "x" | "y" | "z" | 0 = 0;
  public instanceGroupId: string | null = null;
  public instanceData: InstanceData = DEFAULT_INSTANCE_DATA;
  public sortByDepth: boolean = false;
  public readonly worldAABB: AABBWorld = new AABBWorld();

  // Pre-allocated scratch to avoid per-frame allocation in updateJointMatrices
  private readonly jointMatrixScratch: Mat4[] = Array.from(
    { length: MAX_JOINTS },
    () => Mat4.create(),
  );
  private lastWorldMatrixVersion: number = -1;

  constructor(
    device: GPUDevice,
    name: string,
    geometry: Geometry,
    material: MaterialBase,
  ) {
    super(name);
    this.uniforms = new MeshUniforms(device, name);
    this.geometry = geometry;
    this.material = material;
  }

  public updateWorldAABB(): void {
    if (!this.needsAABBUpdate()) return;
    this.worldAABB.update(this.geometry.aabb, this.transform.worldMatrix);
    this.lastWorldMatrixVersion = this.transform.worldMatrixVersion;
  }

  public needsAABBUpdate(): boolean {
    return this.transform.worldMatrixVersion !== this.lastWorldMatrixVersion;
  }

  public updateJointMatrices(device: GPUDevice): void {
    if (!this.skinData || !this.uniforms) return;

    const count = this.skinData.joints.length;
    for (let i = 0; i < count; i++) {
      const worldMatrix = this.skinData.joints[i].transform.worldMatrix;
      Mat4.multiply(
        worldMatrix,
        this.skinData.inverseBindMatrices[i],
        this.jointMatrixScratch[i],
      );
    }

    this.uniforms.updateJointMatrices(device, this.jointMatrixScratch, count);
    this.uniforms.setApplySkinning(device, true);
  }
}
