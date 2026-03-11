import { Entity, ENTITY_TYPE } from "./Entity";
import {
  VertexParticle,
  ParticleInstance,
  ParticleInstanceGPU,
} from "../particles";
import { Vec3, Mat4 } from "../math";
import { MaterialParticle } from "../materials";

export interface ParticleEmitterDesc {
  spawnCount: number;
  spawnRate: number;
  spawnPositions: [number, number, number][];
  spawnScales: number[];
  spawnRotations: [number, number, number, number][];
  spawnVelocities: [number, number, number][];
  spawnLifetimes: number[];
  spawnAlphas: number[];
  spawnBillboards: number[];
}

export class ParticleEmitter extends Entity {
  private device: GPUDevice;
  public maxInstances: number;
  public instances: ParticleInstance[];
  private deadPool: ParticleInstance[] = [];
  public aliveCount: number = 0;

  [ENTITY_TYPE]: "particle" = "particle";

  public material: MaterialParticle;

  public vertexBuffer: GPUBuffer;
  public indexBuffer: GPUBuffer;
  public instanceBuffer: GPUBuffer;
  public indexCount: number;

  public meshUniformsBuffer: GPUBuffer;
  public materialUniformsBuffer: GPUBuffer;

  private timeSinceLastSpawn: number = 0;

  public desc: ParticleEmitterDesc;

  private instanceBufferData: ArrayBuffer;
  private floatView: Float32Array;
  private uintView: Uint32Array;

  private tempPos: Vec3 = new Vec3();
  private tempVel: Vec3 = new Vec3();

  constructor(
    device: GPUDevice,
    name: string,
    desc: ParticleEmitterDesc,
    maxInstances: number = 1000,
    material?: MaterialParticle,
  ) {
    super(name);
    this.device = device;
    this.desc = desc;
    this.maxInstances = maxInstances;
    this.instances = [];
    this.material = material ?? new MaterialParticle();

    const vertices = VertexParticle.createQuad();
    const indices = VertexParticle.getIndexArray();

    const vertexData = new Float32Array(
      (vertices.length * VertexParticle.vertexSize) / 4,
    );
    for (let i = 0; i < vertices.length; i++) {
      const vertexArray = vertices[i].toArray();
      vertexData.set(vertexArray, i * 10);
    }

    this.vertexBuffer = device.createBuffer({
      label: `${name} Vertex Buffer`,
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    this.indexBuffer = device.createBuffer({
      label: `${name} Index Buffer`,
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    this.indexCount = indices.length;

    this.instanceBuffer = device.createBuffer({
      label: `${name} Instance Buffer`,
      size: maxInstances * ParticleInstanceGPU.stride,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.instanceBufferData = new ArrayBuffer(
      maxInstances * ParticleInstanceGPU.stride,
    );
    this.floatView = new Float32Array(this.instanceBufferData);
    this.uintView = new Uint32Array(this.instanceBufferData);

    this.meshUniformsBuffer = device.createBuffer({
      label: `${name} Mesh Uniforms Buffer`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.materialUniformsBuffer = device.createBuffer({
      label: `${name} Material Uniforms Buffer`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.updateMeshUniforms();
    this.updateMaterialUniforms();
  }

  private updateMeshUniforms(): void {
    const atlasRegions = new Float32Array([
      this.material.atlasRegionsX,
      this.material.atlasRegionsY,
      this.material.atlasRegionsTotal,
      0,
    ]);
    this.device.queue.writeBuffer(this.meshUniformsBuffer, 0, atlasRegions);
  }

  private updateMaterialUniforms(): void {
    const gradientMapEnabled = this.material.gradientMapEnabled ? 1 : 0;
    const materialUniforms = new Uint32Array([
      gradientMapEnabled,
      this.material.gradientMapCount,
      0,
      0,
    ]);
    this.device.queue.writeBuffer(
      this.materialUniformsBuffer,
      0,
      materialUniforms,
    );
  }

  public updateMaterial(): void {
    this.updateMeshUniforms();
    this.updateMaterialUniforms();
  }

  update(delta: number = 0): void {
    this.timeSinceLastSpawn += delta;

    const spawnInterval = 1.0 / this.desc.spawnRate;

    while (this.timeSinceLastSpawn >= spawnInterval) {
      this.timeSinceLastSpawn -= spawnInterval;
      this.spawn();
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

    this.aliveCount = this.instances.length;
    this.updateInstanceBuffer();
  }

  private spawn(): void {
    const worldMatrix = this.transform.getWorldMatrix();
    const rotation = this.transform.rotation;

    for (let i = 0; i < this.desc.spawnCount; i++) {
      if (this.instances.length >= this.maxInstances) {
        break;
      }

      const spawnIndex = i % this.desc.spawnPositions.length;

      const localPos = this.desc.spawnPositions[spawnIndex];
      const worldPos = Vec3.transformMat4(
        this.tempPos.set(localPos[0], localPos[1], localPos[2]),
        worldMatrix,
        this.tempPos,
      );

      const localVel = this.desc.spawnVelocities[spawnIndex];
      const worldVel = Vec3.transformQuat(
        this.tempVel.set(localVel[0], localVel[1], localVel[2]),
        rotation,
        this.tempVel,
      );

      const rot = this.desc.spawnRotations[spawnIndex];
      let instance: ParticleInstance;

      if (this.deadPool.length > 0) {
        instance = this.deadPool.pop()!;
        instance.reset(
          [worldPos.x, worldPos.y, worldPos.z],
          this.desc.spawnScales[spawnIndex],
          [rot[0], rot[1], rot[2], rot[3]],
          [worldVel.x, worldVel.y, worldVel.z],
          this.desc.spawnLifetimes[spawnIndex],
          0,
          0,
          this.desc.spawnAlphas[spawnIndex],
          this.desc.spawnBillboards[spawnIndex],
        );
      } else {
        instance = new ParticleInstance(
          [worldPos.x, worldPos.y, worldPos.z],
          this.desc.spawnScales[spawnIndex],
          [rot[0], rot[1], rot[2], rot[3]],
          [worldVel.x, worldVel.y, worldVel.z],
          this.desc.spawnLifetimes[spawnIndex],
          0,
          0,
          this.desc.spawnAlphas[spawnIndex],
          this.desc.spawnBillboards[spawnIndex],
          0.0,
        );
      }

      this.instances.push(instance);
    }
  }

  private updateInstanceBuffer(): void {
    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i];
      const offset = i * 13;

      this.floatView[offset + 0] = instance.position[0];
      this.floatView[offset + 1] = instance.position[1];
      this.floatView[offset + 2] = instance.position[2];
      this.floatView[offset + 3] = instance.scale;

      this.floatView[offset + 4] = instance.rotation[0];
      this.floatView[offset + 5] = instance.rotation[1];
      this.floatView[offset + 6] = instance.rotation[2];
      this.floatView[offset + 7] = instance.rotation[3];

      this.uintView[offset + 8] = instance.atlasRegionIndex;
      this.uintView[offset + 9] = instance.gradientMapIndex;

      this.floatView[offset + 10] = instance.alpha;

      this.uintView[offset + 11] = instance.billboard;

      this.floatView[offset + 12] = instance.frameLerp;
    }

    this.device.queue.writeBuffer(
      this.instanceBuffer,
      0,
      this.instanceBufferData,
      0,
      this.instances.length * ParticleInstanceGPU.stride,
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
    spawnPositions: [[0, 0, 0]],
    spawnScales: [0.5],
    spawnRotations: [[0, 0, 0, 1]],
    spawnVelocities: [[0, 1, 0]],
    spawnLifetimes: [2.0],
    spawnAlphas: [1.0],
    spawnBillboards: [1],
  };
}
