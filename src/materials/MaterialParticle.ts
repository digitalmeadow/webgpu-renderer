import { Texture } from "../textures";

export class MaterialParticle {
  public spriteTexture: Texture | null = null;
  public gradientMapTexture: Texture | null = null;
  public gradientMapEnabled: boolean = false;
  public gradientMapCount: number = 1;
  public atlasRegionsX: number = 1;
  public atlasRegionsY: number = 1;
  public atlasRegionsTotal: number = 1;
  public alphaMode: "opaque" | "blend" = "blend";
  public doubleSided: boolean = true;

  async load(): Promise<void> {
    const promises: Promise<void>[] = [];
    if (this.spriteTexture) {
      promises.push(this.spriteTexture.load());
    }
    if (this.gradientMapTexture) {
      promises.push(this.gradientMapTexture.load());
      this.gradientMapEnabled = true;
    }
    await Promise.all(promises);
  }
}
