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

@group(3) @binding(0)
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

    // Note: All values output are automatically interpolated across the triangle (modern shader language behaviour)
    var output: VertexOutput;

    let skinned_position: vec4<f32> = skin_matrix * in.position;
    // Conditionally apply skinning
    var final_position: vec4<f32> = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));

    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * final_position;

    // Scale back to the original space
    output.vertex_position = model_position;
    var clip_position = camera_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;

    // Recalculate the normal albedo on the model matrix (works only for uniform scaling by exploiting w=0)
    let normal: vec3<f32> = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    // Fog
    let depth = map_range(clip_position.z, camera_uniforms.near, camera_uniforms.far, 0.0, 1.0);
    output.depth = depth;

    // UV
    output.uv_coords = in.uv_coords;

    return output;
}

// Lighting
struct Light {
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(2) @binding(0)
var<uniform> u_lights: array<Light, 1>;

@group(2) @binding(1)
var shadow_sampler: sampler_comparison;

@group(2) @binding(2)
var shadow_texture: texture_depth_2d_array;

// Material
@group(3) @binding(1)
var albedo_sampler: sampler;

@group(3) @binding(2)
var albedo_texture: texture_2d<f32>;

@group(3) @binding(3)
var metalness_roughness_sampler: sampler;

@group(3) @binding(4)
var metalness_roughness_texture: texture_2d<f32>;

@group(3) @binding(5)
var environment_sampler: sampler;

@group(3) @binding(6)
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

    // Lighting
    // Basic fake downward lighting
    let light_dir = normalize(vec3<f32>(0.0, 1.0, 0.0)); // Light from above (+Y)
    let diffuse = max(dot(normal, light_dir), 0.0);

    let ambient = 0.2;
    let upward_normal = dot(normal, vec3<f32>(0.0, 1.0, 0.0));
    let lighting = ambient + (1.0 - ambient) * diffuse;
    let albedo_lit = albedo.rgb * lighting;

    // Combine albedo and environment
    // Add reflection to albedo to lost less albedo color
    let reflection_albedo_mix = albedo_lit + reflection.rgb;
    var color = mix(albedo_lit, reflection_albedo_mix, reflectivity);

    return vec4(color, 1.0);
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}