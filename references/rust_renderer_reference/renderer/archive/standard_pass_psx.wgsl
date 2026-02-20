// Vertex buffer
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) depth: f32,
};

// Uniforms
// Context uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> context_uniforms: ContextUniforms;

// Camera uniforms
struct CameraUniforms {
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(1) @binding(0)
var<uniform> camera_uniforms: CameraUniforms;

// Mesh uniforms
struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, 128>, // MAX_JOINTS = 128
    apply_skinning: u32,
}

@group(2) @binding(0)
var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(
    in: VertexInput,
) -> VertexOutput {
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );

    var output: VertexOutput;

    let skinned_position: vec4<f32> = skin_matrix * in.position;
    // Conditionally apply skinning
    var final_position: vec4<f32> = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));

    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * final_position;

    // Scale back to the original space
    output.vertex_position = model_position;

    // Recalculate the normal albedod on the model matrix (works only for uniform scaling by exploiting w=0)
    let normal: vec3<f32> = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    // Apply PS1 style vertex snapping two techniques:
    // 1. Vertex position precision rounding (to 3d grid essentially)
    // let vertex_snapping_factor_ms = 5.0;
    // var snapped_position_ms = round(model_position * vertex_snapping_factor_ms) / vertex_snapping_factor_ms;

    // 2. Vertex snapping to pixel grid (2d grid): https://www.david-colson.com/2021/11/30/ps1-style-renderer.html
    // var clip_position = camera_uniforms.view_projection_matrix * snapped_position_ms;
    var clip_position = camera_uniforms.view_projection_matrix * model_position;

    // Fog
    // Convert clip space to NDC
    // let ndc_depth = clip_position.z;
    // let ndc_depth = clip_position.z / clip_position.w;

    // Map NDC depth (-1.0 to 1.0) to [0.0, 1.0]
    // var depth = map_range(ndc_depth, -1.0, 1.0, 0.0, 1.0);
    // var depth = (ndc_depth + 1.0) / 2.0;
    // depth = clamp((ndc_depth + 1.0) / 2.0, 0.0, 1.0);
    let depth = map_range(clip_position.z, camera_uniforms.near, camera_uniforms.far, 0.0, 1.0);

    output.depth = depth;

    // Snap to pixel grid
    // https://www.w3.org/TR/webgpu/#coordinate-systems
    // Normalized device coordinates (NDC) range from -1 to 1 so 2 / length gives pixel size
    // let render_width = 640.0 / 4.0;
    let render_width = context_uniforms.render_size.x;
    // let render_height = 480.0 / 4.0;
    let render_height = context_uniforms.render_size.y;
    let pixel_size_ndc: vec2<f32> = vec2<f32>(2.0 / render_width, 2.0 / render_height);

    // Convert to NDC
    var ndc_position = clip_position.xyz / clip_position.w;

    // Snap to the nearest pixel in NDC
    ndc_position.x = round(ndc_position.x / pixel_size_ndc.x) * pixel_size_ndc.x;
    ndc_position.y = round(ndc_position.y / pixel_size_ndc.y) * pixel_size_ndc.y;

    // Convert back to clip space
    clip_position = vec4<f32>(ndc_position * clip_position.w, clip_position.w);

    output.position = clip_position;

    output.uv_coords = in.uv_coords;

    return output;
}

@group(2) @binding(1)
var albedo_sampler: sampler;

@group(2) @binding(2)
var albedo_texture: texture_2d<f32>;

@group(2) @binding(3)
var metalness_roughness_sampler: sampler;

@group(2) @binding(4)
var metalness_roughness_texture: texture_2d<f32>;

@group(2) @binding(5)
var environment_sampler: sampler;

@group(2) @binding(6)
var environment_texture: texture_cube<f32>;

// Fragment shader
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Vectors
    let normal: vec3<f32> = normalize(in.vertex_normal.xyz);
    let view: vec3<f32> = normalize(camera_uniforms.position.xyz - in.vertex_position.xyz);  // Subtraction gets a vector pointing from the vertex to the eye

    // Texture
    let albedo: vec4<f32> = textureSample(albedo_texture, albedo_sampler, in.uv_coords);

    // Metalness = b channel, Roughness = g channel
    let metalness_roughness: vec4<f32> = textureSample(metalness_roughness_texture, metalness_roughness_sampler, in.uv_coords);
    let metalness = metalness_roughness.b;
    let roughness = metalness_roughness.g;

    // For our simple renderer, we use metalness as reflectivity instead of PBR metalness
    let reflectivity = metalness;
    
    // Sample environment map from reflection vector
    let reflection_vector = reflect(-view, normal);

    // Use mipmaps to sample varying resolution
    let environment_high_res = textureSampleLevel(environment_texture, environment_sampler, reflection_vector, 0.0);
    let environment_low_res = textureSampleLevel(environment_texture, environment_sampler, reflection_vector, 3.0);

    // Use roughness to control the resolution mix of reflections (rougher = low-res blurry reflections)
    let reflection = mix(environment_high_res, environment_low_res, roughness);

    // Combine albedo and environment
    var color = mix(albedo, reflection, reflectivity);

    // Lighting
    // Basic fake downward lighting
    let ambient = 0.0;
    let upward_normal = dot(normal, vec3<f32>(0.0, 1.0, 0.0));
    let light = map_range(upward_normal, 1.0, -1.0, 1.0, 0.0); // Interpolate between full light (upward facing) and no light (downward facing)

    color = color * vec4<f32>(light, light, light, 1.0);

    // Fog
    // let fog_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    // color = mix(color, fog_color, in.depth);

    // Debug
    // let debug_f = in.depth;
    // color = vec4<f32>(debug_f, debug_f, debug_f, 1.0);
    // let debug_v3 = 
    // color = vec4<f32>(debug_v3.x, debug_v3.y, debug_v3.z, 1.0);
    // let debug_v4 =
    // color = debug_v4;
    
    return color;
}

fn non_zero(value: f32) -> f32 {
    let threshold = 0.01;
    if value < threshold && value > -threshold {
        return threshold;
    } else {
        return value;
    }
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}

// https://www.photometric.io/blog/improving-schlicks-approximation/
fn fresnel_schlick(cos_theta: f32, r0: vec3<f32>, s: f32) -> vec3<f32> {
    let one_minus_cos = 1.0 - cos_theta;
    return r0 + (1.0 - r0 - s * cos_theta) * pow(one_minus_cos, 4.0);
}