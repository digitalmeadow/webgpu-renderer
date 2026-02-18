export class Texture {
  url: string;
  bitmap: ImageBitmap | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async load(): Promise<void> {
    const response = await fetch(this.url);
    const blob = await response.blob();
    this.bitmap = await createImageBitmap(blob);
  }
}
