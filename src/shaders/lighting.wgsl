// Lighting Pass Shader
// Reads from G-Buffer and outputs lit color

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = positions[vertex_index] * 0.5 + 0.5;
    output.uv_coords.y = 1.0 - output.uv_coords.y;
    
    return output;
}

// G-Buffer inputs (group 0)
@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var gbuffer_albedo: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_normal_roughness: texture_2d<f32>;
@group(0) @binding(3) var gbuffer_depth: texture_depth_2d;

// Camera uniforms (group 1)
struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample G-Buffer
    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_roughness = textureSample(gbuffer_normal_roughness, sampler_linear, in.uv_coords);
    let normal = normal_roughness.rgb;
    let roughness = normal_roughness.a;

    // Simple ambient light
    let ambient = vec3(1.0, 1.0, 1.0);
    var color = ambient * albedo;

    output.color = vec4<f32>(color, 1.0);
    return output;
}
