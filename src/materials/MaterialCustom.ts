import { MaterialBase, MaterialType, AlphaMode } from "./MaterialBase";

// Fully custom material — user provides complete WGSL shaders and all GPU data.
//
// Shader conventions:
//
// Geometry pass shader (outputs to G-buffer, used when alphaMode is opaque/mask/dither):
//   @group(0) = camera uniforms (CameraUniforms)
//   @group(1) = user's custom bind group
//   Vertex must declare InstanceInput at locations 6–12
//   Fragment must output GBufferOutput (4 targets: albedo rgba8unorm, normal rgba16float,
//     metal_rough rgba8unorm, emissive rgba16float)
//
// Forward pass shader (direct HDR output, used when alphaMode is blend):
//   @group(0) = camera uniforms (CameraUniforms)
//   @group(1) = user's custom bind group
//   Vertex must declare InstanceInput at locations 6–12
//   Fragment outputs single vec4<f32> to rgba16float HDR buffer
//
// CameraUniforms layout (both passes):
//   view_matrix, projection_matrix, view_projection_matrix,
//   view_matrix_inverse, projection_matrix_inverse,
//   position: vec4<f32>, near: f32, far: f32
//
// InstanceInput layout (locations 6–12):
//   model_matrix split across 4x vec4 (loc 6–9), billboard_axis: u32 (loc 10),
//   custom_data_0: vec4 (loc 11), custom_data_1: vec4 (loc 12)

interface MaterialCustomOptions {
  name: string;
  passes?: {
    geometry?: string;
    forward?: string;
  };
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  alphaMode?: AlphaMode;
  doubleSided?: boolean;
}

export class MaterialCustom extends MaterialBase {
  readonly type = MaterialType.Custom;
  passes: { geometry?: string; forward?: string } = {};
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;

  constructor(
    _device: GPUDevice,
    name: string,
    options: MaterialCustomOptions,
  ) {
    super(name, options);
    this.passes = options.passes ?? {};
    this.specialization.isCustom = true;
    this.bindGroupLayout = options.bindGroupLayout;
    this.bindGroup = options.bindGroup;
  }
}
