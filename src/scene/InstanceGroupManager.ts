import { Mesh } from "../mesh";
import {
  InstanceGroup,
  INSTANCE_STRIDE,
  FLOAT_COUNT,
  OFFSET_MATRIX,
  OFFSET_BILLBOARD,
  OFFSET_CUSTOM_DATA0,
  OFFSET_CUSTOM_DATA1,
} from "./InstanceGroup";
import { Geometry } from "../geometries";
import { MaterialBase } from "../materials";
import { Vec3 } from "../math";

export class InstanceGroupManager {
  // All groups created since the last beginFrame() — destroyed as a batch next frame
  private activeGroups: InstanceGroup[] = [];
  private geometryIds: WeakMap<Geometry, number> = new WeakMap();
  private materialIds: WeakMap<MaterialBase, number> = new WeakMap();
  private nextGeometryId = 0;
  private nextMaterialId = 0;

  // Call once at the start of each render() — destroys previous frame's GPU buffers
  beginFrame(): void {
    for (const group of this.activeGroups) {
      group.destroy();
    }
    this.activeGroups = [];
  }

  buildGroups(
    device: GPUDevice,
    meshes: Mesh[],
    cameraPosition?: Vec3,
  ): InstanceGroup[] {
    const groups = new Map<string, InstanceGroup>();

    for (const mesh of meshes) {
      if (!mesh.material) continue;

      const key = this.getGroupKey(mesh);

      if (!groups.has(key)) {
        const group = new InstanceGroup(key, mesh.geometry, mesh.material);
        group.sortByDepth = mesh.sortByDepth;
        groups.set(key, group);
      }

      const group = groups.get(key)!;

      if (mesh.sortByDepth !== group.sortByDepth) {
        console.warn(`InstanceGroup ${key}: sortByDepth mismatch between meshes`);
      }

      group.addMesh(mesh);
    }

    for (const group of groups.values()) {
      if (group.sortByDepth && cameraPosition) {
        this.sortInstancesByDepth(group, cameraPosition!);
      }
    }

    for (const group of groups.values()) {
      this.updateInstanceBuffer(device, group);
    }

    const result = Array.from(groups.values());
    this.activeGroups.push(...result);
    return result;
  }

  private sortInstancesByDepth(
    group: InstanceGroup,
    cameraPosition: Vec3,
  ): void {
    group.meshes.sort((a, b) => {
      const posA = a.transform.worldMatrix;
      const posB = b.transform.worldMatrix;

      // Extract position from matrix column 3
      const worldPosA = new Vec3(posA.data[12], posA.data[13], posA.data[14]);
      const worldPosB = new Vec3(posB.data[12], posB.data[13], posB.data[14]);

      const distSqA = Vec3.distanceSquared(cameraPosition, worldPosA);
      const distSqB = Vec3.distanceSquared(cameraPosition, worldPosB);

      // Descending — furthest first for back-to-front alpha blending
      return distSqB - distSqA;
    });
  }

  private getGroupKey(mesh: Mesh): string {
    const geometryId = this.getGeometryId(mesh.geometry);
    const materialId = this.getMaterialId(mesh.material!);

    if (mesh.instanceGroupId) {
      return `${mesh.instanceGroupId}_${geometryId}_${materialId}`;
    }

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

    group.instanceBuffer = device.createBuffer({
      label: `Instance Buffer ${group.id}`,
      size,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const underlying = new ArrayBuffer(size);
    group.instanceBufferData = new Float32Array(underlying);
    const uintView = new Uint32Array(underlying);

    for (let i = 0; i < group.meshes.length; i++) {
      const mesh = group.meshes[i];
      const offset = i * FLOAT_COUNT;

      const matrix = mesh.transform.worldMatrix;
      group.instanceBufferData.set(matrix.data, offset + OFFSET_MATRIX);

      uintView[offset + OFFSET_BILLBOARD] = this.getBillboardValue(mesh.billboard);

      const data0 = mesh.instanceData?.customData0 || [0, 0, 0, 0];
      group.instanceBufferData.set(data0, offset + OFFSET_CUSTOM_DATA0);

      const data1 = mesh.instanceData?.customData1 || [0, 0, 0, 0];
      group.instanceBufferData.set(data1, offset + OFFSET_CUSTOM_DATA1);
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
    this.beginFrame();
  }
}
