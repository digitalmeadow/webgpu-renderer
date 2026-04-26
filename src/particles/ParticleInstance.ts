import { Vec3, Quat } from "../math";

export class ParticleInstance {
  public position: Vec3;
  public scale: number;
  public rotation: Quat;
  public velocity: Vec3;
  public lifetime: number;
  public maxLifetime: number;
  public atlasRegionIndex: number;
  public gradientMapIndex: number;
  public alpha: number;
  public billboard: number;
  public frameLerp: number;
  public spawnIndex: number;

  constructor(
    position: Vec3 = new Vec3(),
    scale: number = 1.0,
    rotation: Quat = Quat.create(),
    velocity: Vec3 = new Vec3(),
    lifetime: number = 1.0,
    atlasRegionIndex: number = 0,
    gradientMapIndex: number = 0,
    alpha: number = 1.0,
    billboard: number = 1,
    frameLerp: number = 0.0,
    spawnIndex: number = 0,
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
    this.spawnIndex = spawnIndex;
  }

  /** 1.0 = just spawned, 0.0 = expired */
  get lifeRatio(): number {
    return this.lifetime / this.maxLifetime;
  }

  /** 0.0 = just spawned, 1.0 = expired */
  get lifeProgress(): number {
    return 1.0 - this.lifeRatio;
  }

  isAlive(): boolean {
    return this.lifetime > 0;
  }

  reset(
    position: Vec3,
    scale: number,
    rotation: Quat,
    velocity: Vec3,
    lifetime: number,
    atlasRegionIndex: number = 0,
    gradientMapIndex: number = 0,
    alpha: number = 1.0,
    billboard: number = 1,
    spawnIndex: number = 0,
  ): void {
    Vec3.copy(position, this.position);
    this.scale = scale;
    Quat.copy(rotation, this.rotation);
    Vec3.copy(velocity, this.velocity);
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.atlasRegionIndex = atlasRegionIndex;
    this.gradientMapIndex = gradientMapIndex;
    this.alpha = alpha;
    this.billboard = billboard;
    this.frameLerp = 0.0; // Always reset to 0 — animation frame interpolation restarts
    this.spawnIndex = spawnIndex;
  }

  update(delta: number): void {
    this.position.data[0] += this.velocity.data[0] * delta;
    this.position.data[1] += this.velocity.data[1] * delta;
    this.position.data[2] += this.velocity.data[2] * delta;
    this.lifetime -= delta;
  }
}
