struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_normal: vec4<f32>,
    @location(1) uv_coords: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: mat4x4<f32>;

@group(2) @binding(0) var albedoTexture: texture_2d<f32>;
@group(2) @binding(1) var normalTexture: texture_2d<f32>;
@group(2) @binding(2) var metalnessRoughnessTexture: texture_2d<f32>;
@group(2) @binding(3) var sampler_linear: sampler;
@group(2) @binding(4) var sampler_nearest: sampler;
@group(2) @binding(5) var sampler_compare: sampler_comparison;

@group(2) @binding(7) var<uniform> material: MaterialUniforms;

struct MaterialUniforms {
    color: vec4<f32>,
    opacity: f32,
    _padding: vec3<f32>,
}

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near_far: vec2<f32>,
}

//--HOOK_PLACEHOLDER_UNIFORMS--//

fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
) -> VertexOutput {
    var output: VertexOutput;

    let modelPosition = model * position;
    output.position = camera.view_projection_matrix * modelPosition;
    output.world_normal = model * normal;
    output.uv_coords = uv;
    return output;
}

 struct GBufferOutput {
     @location(0) albedo: vec4<f32>,
     @location(1) normal: vec4<f32>,
     @location(2) metal_rough: vec4<f32>,
 };

 @fragment
 fn fs_main(in: VertexOutput) -> GBufferOutput {
     var output: GBufferOutput;

     output.albedo = material.color;
     output.albedo.a = material.color.a * material.opacity;
     output.normal = vec4<f32>(normalize(in.world_normal.xyz), 1.0);
     
     let metal_rough = textureSample(metalnessRoughnessTexture, sampler_linear, in.uv_coords);
     output.metal_rough = vec4<f32>(metal_rough.b, metal_rough.g, 0.0, 1.0);

     return output;
 }
