struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
};

//--HOOK_PLACEHOLDER_UNIFORMS--//

// Default (weak) functions that will be overridden if a hook is provided.
fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, defaultSampler, uv);
}

//--HOOK_PLACEHOLDER_ALBEDO--// // This is where the user's albedo_logic will go

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: mat4x4<f32>;

@group(2) @binding(0) var defaultSampler: sampler;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;
@group(2) @binding(2) var normalTexture: texture_2d<f32>;
@group(2) @binding(3) var metalnessRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var<uniform> material: MaterialUniforms;

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
     @location(2) uv: vec2<f32>
 ) -> VertexOutput {
     var output: VertexOutput;
     output.position = camera.view_projection_matrix * model * position;
     output.world_normal = (model * vec4<f32>(normal, 0.0)).xyz;
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

    output.albedo = get_albedo_color(in.uv_coords);
    output.albedo.a = output.albedo.a * material.opacity;
    output.normal = vec4<f32>(normalize(in.world_normal), 1.0);
    
    let metal_rough = textureSample(metalnessRoughnessTexture, defaultSampler, in.uv_coords);
    output.metal_rough = vec4<f32>(metal_rough.b, metal_rough.g, 0.0, 1.0); // B = metallic, G = roughness

    return output;
}
