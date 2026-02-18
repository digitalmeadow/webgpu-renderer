// A simplified forward uber-shader for transparent objects.

//--HOOK_PLACEHOLDER_UNIFORMS--//

// Default (weak) function that will be overridden if a hook is provided.
fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, defaultSampler, uv);
}

//--HOOK_PLACEHOLDER_ALBEDO--//

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
};

struct CameraUniforms {
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
}

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

// A simple directional light.
struct LightUniforms {
    direction: vec3<f32>,
    color: vec3<f32>,
    intensity: f32,
}

@group(0) @binding(0) var<uniform> camera_uniforms: CameraUniforms;
@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;
@group(2) @binding(0) var<uniform> light_uniforms: LightUniforms;

@group(3) @binding(0) var defaultSampler: sampler;
@group(3) @binding(1) var albedoTexture: texture_2d<f32>;
// Note: normal and metal/rough are not used in this simple forward shader for now

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>
) -> VertexOutput {
    var output: VertexOutput;
    let model_matrix = mesh_uniforms.model_transform_matrix;
    output.position = camera_uniforms.view_projection_matrix * model_matrix * position;
    output.world_normal = (model_matrix * vec4<f32>(normal, 0.0)).xyz;
    output.uv_coords = uv;
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var albedo = get_albedo_color(in.uv_coords);

    // Simple directional lighting
    let light_dir = normalize(light_uniforms.direction);
    let normal = normalize(in.world_normal);
    let diffuse_strength = max(dot(normal, -light_dir), 0.0);
    let diffuse_color = light_uniforms.color * light_uniforms.intensity * diffuse_strength;

    // Combine lighting and albedo
    let final_color = albedo.rgb * diffuse_color + (albedo.rgb * 0.1); // ambient term
    
    return vec4<f32>(final_color, albedo.a);
}
