import { Entity } from "./Entity";
import { VertexParticle, ParticleInstance, ParticleInstanceGPU } from "../particles";
import { Vec3, Mat4 } from "../math";

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
  public aliveCount: number = 0;

  public vertexBuffer: GPUBuffer;
  public indexBuffer: GPUBuffer;
  public instanceBuffer: GPUBuffer;
  public indexCount: number;

  public meshUniformsBuffer: GPUBuffer;
  public materialUniformsBuffer: GPUBuffer;

  private timeSinceLastSpawn: number = 0;

  public desc: ParticleEmitterDesc;

  constructor(
    device: GPUDevice,
    name: string,
    desc: ParticleEmitterDesc,
    maxInstances: number = 1000,
  ) {
    super(name);
    this.device = device;
    this.desc = desc;
    this.maxInstances = maxInstances;
    this.instances = [];

    const vertices = VertexParticle.createQuad();
    const indices = VertexParticle.getIndexArray();

    const vertexData = new Float32Array(vertices.length * VertexParticle.vertexSize / 4);
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

    const defaultAtlasRegions = new Float32Array([1, 1, 1]);
    device.queue.writeBuffer(this.meshUniformsBuffer, 0, defaultAtlasRegions);

    const defaultMaterialUniforms = new Uint32Array([0, 1]);
    device.queue.writeBuffer(this.materialUniformsBuffer, 0, defaultMaterialUniforms);
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
        this.instances.splice(i, 1);
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
        Vec3.create(localPos[0], localPos[1], localPos[2]),
        worldMatrix,
      );

      const localVel = this.desc.spawnVelocities[spawnIndex];
      const worldVel = Vec3.transformQuat(
        Vec3.create(localVel[0], localVel[1], localVel[2]),
        rotation,
      );

      const instance = new ParticleInstance(
        [worldPos.x, worldPos.y, worldPos.z],
        this.desc.spawnScales[spawnIndex],
        [...this.desc.spawnRotations[spawnIndex]],
        [worldVel.x, worldVel.y, worldVel.z],
        this.desc.spawnLifetimes[spawnIndex],
        0,
        0,
        this.desc.spawnAlphas[spawnIndex],
        this.desc.spawnBillboards[spawnIndex],
      );

      this.instances.push(instance);
    }
  }

  private updateInstanceBuffer(): void {
    const instanceData = new Float32Array(this.instances.length * 13);

    for (let i = 0; i < this.instances.length; i++) {
      const instance = this.instances[i];
      const gpuInstance = ParticleInstanceGPU.fromRuntimeInstance(instance);
      const array = gpuInstance.toArray();
      instanceData.set(array, i * 13);
    }

    this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceData);
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
