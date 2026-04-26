import { Entity, EntityType } from "../scene/Entity";
import {
  PARTICLE_QUAD_VERTEX_DATA,
  PARTICLE_QUAD_INDEX_DATA,
} from "./VertexParticle";
import { ParticleInstance } from "./ParticleInstance";
import {
  PARTICLE_INSTANCE_STRIDE,
  PARTICLE_INSTANCE_FLOAT_COUNT,
} from "./ParticleInstanceLayout";
import { Vec3, Quat } from "../math";
import { MaterialParticle } from "../materials";
import { GpuFloats, byteSize } from "../utils";

export interface ParticleEmitterDesc {
  spawnCount: number;
  spawnRate: number;
  spawnPositions: Vec3[];
  spawnScales: number[];
  spawnRotations: Quat[];
  spawnVelocities: Vec3[];
  spawnLifetimes: number[];
  spawnAlphas: number[];
  spawnBillboards: number[];
}

// Mesh uniforms: atlas regions
const MESH_UNIFORMS_FLOAT_COUNT = GpuFloats.vec4;
const MESH_UNIFORMS_BUFFER_SIZE = byteSize(MESH_UNIFORMS_FLOAT_COUNT);

// Material uniforms: gradient map settings
const MATERIAL_UNIFORMS_FLOAT_COUNT = GpuFloats.vec4;
const MATERIAL_UNIFORMS_BUFFER_SIZE = byteSize(MATERIAL_UNIFORMS_FLOAT_COUNT);

export class ParticleEmitter extends Entity {
  readonly type = EntityType.ParticleEmitter;
  public maxInstances: number;
  public instances: ParticleInstance[];
  private deadPool: ParticleInstance[] = [];

  public material: MaterialParticle;

  public vertexBuffer: GPUBuffer;
  public indexBuffer: GPUBuffer;
  public instanceBuffer: GPUBuffer;
  public indexCount: number;

  public meshUniformsBuffer: GPUBuffer;
  public materialUniformsBuffer: GPUBuffer;

  private timeSinceLastSpawn: number = 0;

  public desc: ParticleEmitterDesc;

  // Pre-allocated staging arrays for uniform updates
  private meshUniformsData = new Float32Array(MESH_UNIFORMS_FLOAT_COUNT);
  private materialUniformsData = new Uint32Array(MATERIAL_UNIFORMS_FLOAT_COUNT);

  // floatView and uintView alias the same ArrayBuffer — both index by
  // float32/uint32 slots (4 bytes each), so the same numeric offset works for both.
  private instanceBufferData: ArrayBuffer;
  private floatView: Float32Array;
  private uintView: Uint32Array;

  // Scratch for spawn transforms
  private tempPos: Vec3 = new Vec3();
  private tempVel: Vec3 = new Vec3();
  private tempRot: Quat = Quat.create();

  constructor(
    device: GPUDevice,
    name: string,
    desc: ParticleEmitterDesc,
    maxInstances: number = 1000,
    material?: MaterialParticle,
  ) {
    super(name);
    this.desc = desc;
    this.maxInstances = maxInstances;
    this.instances = [];
    this.material = material ?? new MaterialParticle();

    // Validate desc arrays
    this.validateDesc();

    this.vertexBuffer = device.createBuffer({
      label: `${name} Vertex Buffer`,
      size: PARTICLE_QUAD_VERTEX_DATA.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(
      PARTICLE_QUAD_VERTEX_DATA,
    );
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      label: `${name} Index Buffer`,
      size: PARTICLE_QUAD_INDEX_DATA.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(
      PARTICLE_QUAD_INDEX_DATA,
    );
    this.indexBuffer.unmap();

    this.indexCount = PARTICLE_QUAD_INDEX_DATA.length;

    this.instanceBuffer = device.createBuffer({
      label: `${name} Instance Buffer`,
      size: maxInstances * PARTICLE_INSTANCE_STRIDE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.instanceBufferData = new ArrayBuffer(
      maxInstances * PARTICLE_INSTANCE_STRIDE,
    );
    this.floatView = new Float32Array(this.instanceBufferData);
    this.uintView = new Uint32Array(this.instanceBufferData);

    this.meshUniformsBuffer = device.createBuffer({
      label: `${name} Mesh Uniforms Buffer`,
      size: MESH_UNIFORMS_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.materialUniformsBuffer = device.createBuffer({
      label: `${name} Material Uniforms Buffer`,
      size: MATERIAL_UNIFORMS_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.updateMeshUniforms(device);
    this.updateMaterialUniforms(device);
  }

  private validateDesc(): void {
    if (
      this.desc.spawnPositions.length !== this.desc.spawnCount ||
      this.desc.spawnScales.length !== this.desc.spawnCount ||
      this.desc.spawnRotations.length !== this.desc.spawnCount ||
      this.desc.spawnVelocities.length !== this.desc.spawnCount ||
      this.desc.spawnLifetimes.length !== this.desc.spawnCount ||
      this.desc.spawnAlphas.length !== this.desc.spawnCount ||
      this.desc.spawnBillboards.length !== this.desc.spawnCount
    ) {
      throw new Error(
        `ParticleEmitter "${this.name}": desc arrays have mismatched lengths`,
      );
    }
  }

  private updateMeshUniforms(device: GPUDevice): void {
    this.meshUniformsData[0] = this.material.atlasRegionsX;
    this.meshUniformsData[1] = this.material.atlasRegionsY;
    this.meshUniformsData[2] = this.material.atlasRegionsTotal;
    this.meshUniformsData[3] = 0;
    device.queue.writeBuffer(this.meshUniformsBuffer, 0, this.meshUniformsData);
  }

  private updateMaterialUniforms(device: GPUDevice): void {
    this.materialUniformsData[0] = this.material.gradientMapEnabled ? 1 : 0;
    this.materialUniformsData[1] = this.material.gradientMapCount;
    this.materialUniformsData[2] = 0;
    this.materialUniformsData[3] = 0;
    device.queue.writeBuffer(
      this.materialUniformsBuffer,
      0,
      this.materialUniformsData,
    );
  }

  updateParticles(device: GPUDevice, delta: number = 0): void {
    this.updateMeshUniforms(device);
    this.updateMaterialUniforms(device);
    this.validateDesc();

    this.timeSinceLastSpawn += delta;

    if (this.desc.spawnRate <= 0) {
      this.timeSinceLastSpawn = 0;
    } else {
      const spawnInterval = 1.0 / this.desc.spawnRate;
      while (this.timeSinceLastSpawn >= spawnInterval) {
        this.timeSinceLastSpawn -= spawnInterval;
        this.spawn();
      }
      // Clamp residual so a rate increase doesn't trigger a burst
      this.timeSinceLastSpawn = Math.min(
        this.timeSinceLastSpawn,
        spawnInterval,
      );
    }

    for (let i = this.instances.length - 1; i >= 0; i--) {
      const instance = this.instances[i];
      instance.update(delta);

      if (!instance.isAlive()) {
        this.deadPool.push(instance);
        this.instances[i] = this.instances[this.instances.length - 1];
        this.instances.pop();
      }
    }

    this.updateInstanceBuffer(device);
  }

  private spawn(): void {
    const worldMatrix = this.transform.worldMatrix;
    const rotation = this.transform.rotation;

    for (let i = 0; i < this.desc.spawnCount; i++) {
      if (this.instances.length >= this.maxInstances) {
        break;
      }

      const spawnIndex = i % this.desc.spawnPositions.length;

      const localPos = this.desc.spawnPositions[spawnIndex];
      Vec3.transformMat4(localPos, worldMatrix, this.tempPos);

      const localVel = this.desc.spawnVelocities[spawnIndex];
      Vec3.transformQuat(localVel, rotation, this.tempVel);

      const rot = this.desc.spawnRotations[spawnIndex];
      Quat.copy(rot, this.tempRot);

      let instance: ParticleInstance;

      if (this.deadPool.length > 0) {
        instance = this.deadPool.pop()!;
        instance.reset(
          this.tempPos,
          this.desc.spawnScales[spawnIndex],
          this.tempRot,
          this.tempVel,
          this.desc.spawnLifetimes[spawnIndex],
          0,
          0,
          this.desc.spawnAlphas[spawnIndex],
          this.desc.spawnBillboards[spawnIndex],
          spawnIndex,
        );
      } else {
        instance = new ParticleInstance(
          this.tempPos.copy(),
          this.desc.spawnScales[spawnIndex],
          this.tempRot.copy(),
          this.tempVel.copy(),
          this.desc.spawnLifetimes[spawnIndex],
          0,
          0,
          this.desc.spawnAlphas[spawnIndex],
          this.desc.spawnBillboards[spawnIndex],
          0.0,
          spawnIndex,
        );
      }

      this.instances.push(instance);
    }
  }

  private updateInstanceBuffer(device: GPUDevice): void {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i];
      const offset = i * PARTICLE_INSTANCE_FLOAT_COUNT;

      this.floatView[offset + 0] = instance.position.data[0];
      this.floatView[offset + 1] = instance.position.data[1];
      this.floatView[offset + 2] = instance.position.data[2];
      this.floatView[offset + 3] = instance.scale;

      this.floatView[offset + 4] = instance.rotation.data[0];
      this.floatView[offset + 5] = instance.rotation.data[1];
      this.floatView[offset + 6] = instance.rotation.data[2];
      this.floatView[offset + 7] = instance.rotation.data[3];

      this.uintView[offset + 8] = instance.atlasRegionIndex;
      this.uintView[offset + 9] = instance.gradientMapIndex;

      this.floatView[offset + 10] = instance.alpha;

      this.uintView[offset + 11] = instance.billboard;

      this.floatView[offset + 12] = instance.frameLerp;
    }

    device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.instanceBufferData,
      0,
      this.instances.length * PARTICLE_INSTANCE_STRIDE,
    );
  }

  destroy(): void {
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
    this.instanceBuffer.destroy();
    this.meshUniformsBuffer.destroy();
    this.materialUniformsBuffer.destroy();
  }
}

export function createDefaultParticleEmitterDesc(): ParticleEmitterDesc {
  return {
    spawnCount: 1,
    spawnRate: 10,
    spawnPositions: [new Vec3()],
    spawnScales: [0.5],
    spawnRotations: [Quat.create()],
    spawnVelocities: [new Vec3(0, 1, 0)],
    spawnLifetimes: [2.0],
    spawnAlphas: [1.0],
    spawnBillboards: [1],
  };
}
