import { MaterialBase, RenderPass } from "./MaterialBase";
import { MaterialUniforms } from "./MaterialUniforms";

interface MaterialCustomUniforms {
  [key: string]: number | number[];
}

interface MaterialCustomOptions {
  name: string;
  renderPass: RenderPass;
  passes?: {
    geometry?: string;
    forward?: string;
  };
  uniforms?: MaterialCustomUniforms;
  alphaMode?: "opaque" | "blend" | "mask";
  opacity?: number;
  doubleSided?: boolean;
}

export class MaterialCustom extends MaterialBase {
  passes: { geometry?: string; forward?: string } = {};
  customUniforms: MaterialCustomUniforms = {};
  public uniforms: MaterialUniforms;

  constructor(
    device: GPUDevice,
    name: string,
    options: MaterialCustomOptions,
  ) {
    super(name, options);
    this.passes = options.passes ?? {};
    this.customUniforms = options.uniforms ?? {};
    this.specialization.isCustom = true;
    this.uniforms = new MaterialUniforms(device, this);
  }
}
