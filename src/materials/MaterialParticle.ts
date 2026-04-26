import { Texture } from "../textures";
import { MaterialBase, MaterialType } from "./MaterialBase";

export class MaterialParticle extends MaterialBase {
  readonly type = MaterialType.Particle;
  public spriteTexture: Texture | null = null;
  public gradientMapTexture: Texture | null = null;
  public gradientMapCount: number = 1;
  public atlasRegionsX: number = 1;
  public atlasRegionsY: number = 1;
  public atlasRegionsTotal: number = 1;

  constructor(name: string = "particle") {
    super(name, { alphaMode: "blend", doubleSided: true });
  }

  get gradientMapEnabled(): boolean {
    return this.gradientMapTexture !== null;
  }

  async load(): Promise<void> {
    const promises: Promise<void>[] = [];
    if (this.spriteTexture) promises.push(this.spriteTexture.load());
    if (this.gradientMapTexture) promises.push(this.gradientMapTexture.load());
    await Promise.all(promises);
  }
}
