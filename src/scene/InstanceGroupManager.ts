import { Mesh } from "../mesh";
import { InstanceGroup, INSTANCE_STRIDE } from "./InstanceGroup";
import { Geometry } from "../geometries";
import { MaterialBase } from "../materials";
import { Vec3 } from "../math";

export class InstanceGroupManager {
  private groups: Map<string, InstanceGroup> = new Map();
  private geometryIds: WeakMap<Geometry, number> = new WeakMap();
  private materialIds: WeakMap<MaterialBase, number> = new WeakMap();
  private nextGeometryId = 0;
  private nextMaterialId = 0;

  buildGroups(
    device: GPUDevice,
    meshes: Mesh[],
    cameraPosition: Vec3,
  ): InstanceGroup[] {
    this.groups.clear();

    for (const mesh of meshes) {
      if (!mesh.material) continue;

      const key = this.getGroupKey(mesh);

      if (!this.groups.has(key)) {
        const group = new InstanceGroup(key, mesh.geometry, mesh.material);
        // Inherit sortByDepth from first mesh in group
        group.sortByDepth = mesh.sortByDepth;
        this.groups.set(key, group);
      }

      this.groups.get(key)!.addMesh(mesh);
    }

    // Sort groups that need depth sorting
    for (const group of this.groups.values()) {
      if (group.sortByDepth) {
        this.sortInstancesByDepth(group, cameraPosition);
      }
    }

    // Update all instance buffers
    for (const group of this.groups.values()) {
      this.updateInstanceBuffer(device, group);
    }

    return Array.from(this.groups.values());
  }

  private sortInstancesByDepth(
    group: InstanceGroup,
    cameraPosition: Vec3,
  ): void {
    group.meshes.sort((a, b) => {
      // Get world positions from transforms
      const posA = a.transform.getWorldMatrix();
      const posB = b.transform.getWorldMatrix();

      // Extract position from matrix (column 3: indices 12, 13, 14)
      const worldPosA = new Vec3(posA.data[12], posA.data[13], posA.data[14]);
      const worldPosB = new Vec3(posB.data[12], posB.data[13], posB.data[14]);

      // Calculate squared distances (skip sqrt for performance)
      const distSqA = Vec3.distanceSquared(cameraPosition, worldPosA);
      const distSqB = Vec3.distanceSquared(cameraPosition, worldPosB);

      // Sort descending (furthest first = back-to-front for alpha blending)
      return distSqB - distSqA;
    });
  }

  private getGroupKey(mesh: Mesh): string {
    const geometryId = this.getGeometryId(mesh.geometry);
    const materialId = this.getMaterialId(mesh.material!);

    // User-specified instance group
    if (mesh.instanceGroupId) {
      return `${mesh.instanceGroupId}_${geometryId}_${materialId}`;
    }

    // Auto-batch by geometry + material
    return `_auto_${geometryId}_${materialId}`;
  }

  private getGeometryId(geometry: Geometry): number {
    if (!this.geometryIds.has(geometry)) {
      this.geometryIds.set(geometry, this.nextGeometryId++);
    }
    return this.geometryIds.get(geometry)!;
  }

  private getMaterialId(material: MaterialBase): number {
    if (!this.materialIds.has(material)) {
      this.materialIds.set(material, this.nextMaterialId++);
    }
    return this.materialIds.get(material)!;
  }

  private updateInstanceBuffer(device: GPUDevice, group: InstanceGroup): void {
    const size = group.meshes.length * INSTANCE_STRIDE;

    // Create or resize buffer
    if (!group.instanceBuffer || group.instanceBuffer.size < size) {
      group.instanceBuffer?.destroy();
      group.instanceBuffer = device.createBuffer({
        label: `Instance Buffer ${group.id}`,
        size,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    group.instanceBufferData = new ArrayBuffer(size);
    const floatView = new Float32Array(group.instanceBufferData);
    const uintView = new Uint32Array(group.instanceBufferData);

    for (let i = 0; i < group.meshes.length; i++) {
      const mesh = group.meshes[i];
      const offset = (i * INSTANCE_STRIDE) / 4; // Offset in 32-bit words

      // Model matrix (64 bytes = 16 floats)
      const matrix = mesh.transform.getWorldMatrix();
      floatView.set(matrix.data, offset);

      // Billboard axis (4 bytes at offset 64)
      const billboardValue = this.getBillboardValue(mesh.billboard);
      uintView[offset + 16] = billboardValue;

      // CustomData0 (16 bytes at offset 68)
      const data0 = mesh.instanceData?.customData0 || [0, 0, 0, 0];
      floatView.set(data0, offset + 17);

      // CustomData1 (16 bytes at offset 84)
      const data1 = mesh.instanceData?.customData1 || [1, 1, 1, 1];
      floatView.set(data1, offset + 21);
    }

    device.queue.writeBuffer(group.instanceBuffer, 0, group.instanceBufferData);
    group.instanceCount = group.meshes.length;
  }

  private getBillboardValue(billboard: "x" | "y" | "z" | 0): number {
    if (billboard === "x") return 1;
    if (billboard === "y") return 2;
    if (billboard === "z") return 3;
    return 0;
  }

  clear(): void {
    for (const group of this.groups.values()) {
      group.destroy();
    }
    this.groups.clear();
  }
}
