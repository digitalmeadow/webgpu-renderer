import { ParticleInstance } from "./ParticleInstance";

export class ParticleInstanceGPU {
  public position: [number, number, number];
  public scale: number;
  public rotation: [number, number, number, number];
  public atlasRegionIndex: number;
  public gradientMapIndex: number;
  public alpha: number;
  public billboard: number;
  public frameLerp: number;

  constructor(
    position: [number, number, number] = [0, 0, 0],
    scale: number = 1.0,
    rotation: [number, number, number, number] = [0, 0, 0, 1],
    atlasRegionIndex: number = 0,
    gradientMapIndex: number = 0,
    alpha: number = 1.0,
    billboard: number = 1,
    frameLerp: number = 0.0,
  ) {
    this.position = position;
    this.scale = scale;
    this.rotation = rotation;
    this.atlasRegionIndex = atlasRegionIndex;
    this.gradientMapIndex = gradientMapIndex;
    this.alpha = alpha;
    this.billboard = billboard;
    this.frameLerp = frameLerp;
  }

  static get stride(): number {
    return 13 * 4;
  }

  static getBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: ParticleInstanceGPU.stride,
      stepMode: "instance",
      attributes: [
        {
          shaderLocation: 3,
          offset: 0,
          format: "float32x3",
        },
        {
          shaderLocation: 4,
          offset: 12,
          format: "float32",
        },
        {
          shaderLocation: 5,
          offset: 16,
          format: "float32x4",
        },
        {
          shaderLocation: 6,
          offset: 32,
          format: "uint32",
        },
        {
          shaderLocation: 7,
          offset: 36,
          format: "uint32",
        },
        {
          shaderLocation: 8,
          offset: 40,
          format: "float32",
        },
        {
          shaderLocation: 9,
          offset: 44,
          format: "uint32",
        },
        {
          shaderLocation: 10,
          offset: 48,
          format: "float32",
        },
      ],
    };
  }

  toArray(): Float32Array {
    const data = new Float32Array(13);
    data[0] = this.position[0];
    data[1] = this.position[1];
    data[2] = this.position[2];
    data[3] = this.scale;
    data[4] = this.rotation[0];
    data[5] = this.rotation[1];
    data[6] = this.rotation[2];
    data[7] = this.rotation[3];
    data[8] = this.atlasRegionIndex;
    data[9] = this.gradientMapIndex;
    data[10] = this.alpha;
    data[11] = this.billboard;
    data[12] = this.frameLerp;
    return data;
  }

  static fromRuntimeInstance(instance: ParticleInstance): ParticleInstanceGPU {
    return new ParticleInstanceGPU(
      instance.position,
      instance.scale,
      instance.rotation,
      instance.atlasRegionIndex,
      instance.gradientMapIndex,
      instance.alpha,
      instance.billboard,
      instance.frameLerp,
    );
  }
}
