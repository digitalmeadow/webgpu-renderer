export class ParticleInstance {
  public position: [number, number, number];
  public scale: number;
  public rotation: [number, number, number, number];
  public velocity: [number, number, number];
  public lifetime: number;
  public maxLifetime: number;
  public atlasRegionIndex: number;
  public gradientMapIndex: number;
  public alpha: number;
  public billboard: number;
  public frameLerp: number;

  constructor(
    position: [number, number, number] = [0, 0, 0],
    scale: number = 1.0,
    rotation: [number, number, number, number] = [0, 0, 0, 1],
    velocity: [number, number, number] = [0, 0, 0],
    lifetime: number = 1.0,
    atlasRegionIndex: number = 0,
    gradientMapIndex: number = 0,
    alpha: number = 1.0,
    billboard: number = 1,
    frameLerp: number = 0.0,
  ) {
    this.position = position;
    this.scale = scale;
    this.rotation = rotation;
    this.velocity = velocity;
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.atlasRegionIndex = atlasRegionIndex;
    this.gradientMapIndex = gradientMapIndex;
    this.alpha = alpha;
    this.billboard = billboard;
    this.frameLerp = frameLerp;
  }

  get lifeRatio(): number {
    return this.lifetime / this.maxLifetime;
  }

  isAlive(): boolean {
    return this.lifetime > 0;
  }

  reset(
    position: [number, number, number],
    scale: number,
    rotation: [number, number, number, number],
    velocity: [number, number, number],
    lifetime: number,
    atlasRegionIndex: number = 0,
    gradientMapIndex: number = 0,
    alpha: number = 1.0,
    billboard: number = 1,
  ): void {
    this.position[0] = position[0];
    this.position[1] = position[1];
    this.position[2] = position[2];
    this.scale = scale;
    this.rotation[0] = rotation[0];
    this.rotation[1] = rotation[1];
    this.rotation[2] = rotation[2];
    this.rotation[3] = rotation[3];
    this.velocity[0] = velocity[0];
    this.velocity[1] = velocity[1];
    this.velocity[2] = velocity[2];
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.atlasRegionIndex = atlasRegionIndex;
    this.gradientMapIndex = gradientMapIndex;
    this.alpha = alpha;
    this.billboard = billboard;
    this.frameLerp = 0.0;
  }

  update(delta: number): void {
    this.position[0] += this.velocity[0] * delta;
    this.position[1] += this.velocity[1] * delta;
    this.position[2] += this.velocity[2] * delta;
    this.lifetime -= delta;
  }
}
