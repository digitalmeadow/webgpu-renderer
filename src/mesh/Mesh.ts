import { MaterialBase } from "../materials";
import { MeshUniforms } from "./MeshUniforms";
import { Entity, EntityType } from "../scene/Entity";
import { Geometry } from "../geometries";
import { Mat4 } from "../math";
import { SkinData } from "../skinning";
import { InstanceData, DEFAULT_INSTANCE_DATA } from "../scene/InstanceData";

export class Mesh extends Entity {
  readonly type = EntityType.Mesh;
  public geometry: Geometry;
  // NOTE: uniforms are kept for skinning support, but not used in instanced rendering
  // TODO: Implement skinning support for instanced rendering
  public uniforms: MeshUniforms;
  public material: MaterialBase | null = null;
  public skinData: SkinData | null = null;
  public billboard: "x" | "y" | "z" | 0 = 0;
  public instanceGroupId: string | null = null;
  public instanceData: InstanceData = DEFAULT_INSTANCE_DATA;
  public sortByDepth: boolean = false;
  private device: GPUDevice;

  constructor(
    device: GPUDevice,
    name: string,
    geometry: Geometry,
    material: MaterialBase,
  ) {
    super(name);
    this.device = device;
    this.uniforms = new MeshUniforms(device);
    this.geometry = geometry;
    this.material = material;
  }

  public updateWorldAABB(): void {
    const worldMatrix = this.transform.getWorldMatrix();
    this.geometry.aabb.updateWorldSpace(worldMatrix);
  }

  public updateJointMatrices(): void {
    if (!this.skinData || !this.uniforms) return;

    const matrices: Mat4[] = [];
    for (let i = 0; i < this.skinData.joints.length; i++) {
      const jointEntity = this.skinData.joints[i];
      const ibm = this.skinData.inverseBindMatrices[i];

      const worldMatrix = jointEntity.transform.getWorldMatrix();
      const jointMatrix = Mat4.multiply(worldMatrix, ibm);
      matrices.push(jointMatrix);
    }

    this.uniforms.updateJointMatrices(this.device, matrices);
    this.uniforms.setApplySkinning(this.device, true);
  }

  public getDevice(): GPUDevice {
    return this.device;
  }
}
