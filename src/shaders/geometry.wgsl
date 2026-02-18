// Geometry Pass Shader
// Writes albedo and normal to G-Buffer textures

struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
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

@group(0) @binding(0) var<uniform> camera_uniforms: CameraUniforms;
@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    let model_position = mesh_uniforms.model_transform_matrix * in.position;
    output.vertex_position = model_position;

    let clip_position = camera_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;

    // Normal (using model matrix, assumes uniform scaling)
    let normal = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normalize(normal), 0.0);

    output.uv_coords = in.uv_coords;

    return output;
}

// Material Textures
// Group 2 will be used for material bindings
@group(2) @binding(0) var albedo_texture: texture_2d<f32>;
@group(2) @binding(1) var sampler_linear: sampler;

struct FragmentOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal_roughness: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample albedo texture
    let albedo = textureSample(albedo_texture, sampler_linear, in.uv_coords);
    output.albedo = albedo;

    // Normal to view space
    let view_normal = (camera_uniforms.view_matrix * vec4(in.vertex_normal.xyz, 0.0)).xyz;
    // Roughness default to 1.0 (fully rough)
    output.normal_roughness = vec4<f32>(normalize(view_normal), 1.0);

    return output;
}
