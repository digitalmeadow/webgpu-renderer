// Vertex shader (same as geometry pass)
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
};

// Uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0) var<uniform> context_uniforms: ContextUniforms;

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

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, 128>,
    apply_skinning: u32,
}

@group(2) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

struct MaterialUniforms {
    gradient_map_enabled: u32,
    gradient_map_count: u32,
    gradient_map_index: u32,
}

@group(2) @binding(1) var<uniform> material_uniforms: MaterialUniforms;
@group(2) @binding(2) var sampler_linear: sampler;
@group(2) @binding(3) var albedo_texture: texture_2d<f32>;
@group(2) @binding(4) var metalness_roughness_texture: texture_2d<f32>;
@group(2) @binding(5) var environment_texture: texture_cube<f32>;
@group(2) @binding(6) var gradient_map_texture: texture_2d<f32>;

// Lighting (from lighting pass)
const MAX_LIGHT_DIRECTIONAL_COUNT: u32 = 2;
const MAX_LIGHT_SPOT_COUNT: u32 = 8;

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_matrix: u32,
}

struct LightSpotUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near_far_nan_nan: vec4<f32>,
    color_intensity: vec4<f32>,
    _pad: vec4<f32>,
}

@group(3) @binding(0) var sampler_compare: sampler_comparison;
@group(3) @binding(1) var<uniform> light_directionals: array<LightDirectionalUniforms, 2>;
@group(3) @binding(2) var light_directional_shadow_texture_array: texture_depth_2d_array;
@group(3) @binding(3) var<uniform> light_spots: array<LightSpotUniforms, 8>;
@group(3) @binding(4) var light_spot_shadow_texture_array: texture_depth_2d_array;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );

    var output: VertexOutput;

    let skinned_position: vec4<f32> = skin_matrix * in.position;
    var final_position: vec4<f32> = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));

    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * final_position;
    output.vertex_position = model_position;

    var clip_position = camera_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;

    let normal: vec3<f32> = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    output.uv_coords = in.uv_coords;

    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample material textures
    let albedo: vec4<f32> = textureSample(albedo_texture, sampler_linear, in.uv_coords);
    let metalness_roughness: vec4<f32> = textureSample(metalness_roughness_texture, sampler_linear, in.uv_coords);
    
    let metalness = metalness_roughness.b;
    let roughness = metalness_roughness.g;
    
    // Gradient mapping (if enabled)
    let lighting_scalar = clamp(length(albedo.rgb) / 3.0, 0.0, 1.0);
    let gradient_selection = f32(material_uniforms.gradient_map_index) / max(1.0, f32(material_uniforms.gradient_map_count));
    let gradient_map_uv = vec2(lighting_scalar, gradient_selection);
    let color_mapped = textureSample(gradient_map_texture, sampler_linear, gradient_map_uv);
    let base_color = select(albedo.rgb, color_mapped.rgb, bool(material_uniforms.gradient_map_enabled));
    
    // Lighting calculation (simplified forward lighting)
    let world_pos = in.vertex_position.xyz;
    let world_normal = normalize(in.vertex_normal.xyz);
    
    var lit_color = vec3(0.0);
    
    // Directional lights
    for (var i = 0u; i < MAX_LIGHT_DIRECTIONAL_COUNT; i += 1u) {
        let light = light_directionals[i];
        
        // Shadow calculation (simplified - using first cascade)
        let shadow_matrix = light.view_projection_matrices[0];
        let shadow_coords = shadow_matrix * vec4(world_pos, 1.0);
        let shadow = fetch_light_directional_shadow(i * 3u, shadow_coords);
        
        let light_dir = normalize(-light.direction.xyz);
        let diffuse = max(0.0, dot(world_normal, light_dir));
        let intensity = light.color.a;
        
        lit_color += light.color.rgb * shadow * diffuse * base_color * intensity;
    }
    
    // Spotlights
    for (var j = 0u; j < MAX_LIGHT_SPOT_COUNT; j += 1u) {
        let light_spot = light_spots[j];
        
        if (light_spot.color_intensity.a <= 0.5) {
            continue;
        }
        
        let shadow_coords = light_spot.view_projection_matrix * vec4(world_pos, 1.0);
        
        if (shadow_coords.w <= 0.0) {
            continue;
        }
        
        let shadow = fetch_light_spot_shadow(j, shadow_coords);
        
        let light_to_frag = world_pos - light_spot.position.xyz;
        let light_dir = normalize(-light_to_frag);
        let diffuse = max(0.0, dot(world_normal, light_dir));
        let intensity = light_spot.color_intensity.a;
        
        lit_color += light_spot.color_intensity.rgb * shadow * diffuse * base_color * intensity;
    }
    
    // Ambient
    let ambient = vec3(0.15);
    lit_color += ambient * base_color;
    
    // Return with alpha from texture
    return vec4(lit_color, albedo.a);
}

// Shadow sampling functions (from lighting_pass.wgsl)
const TAU: f32 = 6.283185307179586;
const GOLDEN_ANGLE: f32 = 3.883222077450933;
const VOGEL_SAMPLES: u32 = 12u;
const FILTER_RADIUS: f32 = 2.0;

fn ign(px: i32, py: i32) -> f32 {
    let fx = f32(px);
    let fy = f32(py);
    return fract(52.9829189 * fract(0.06711056 * fx + 0.00583715 * fy));
}

fn vogel_offset(i: u32, n: u32, rotation: f32) -> vec2<f32> {
    let f_i = f32(i);
    let f_n = f32(n);
    let r  = sqrt((f_i + 0.5) / f_n);
    let th = rotation + f_i * GOLDEN_ANGLE;
    return vec2<f32>(cos(th), sin(th)) * r;
}

fn fetch_light_directional_shadow(cascade_id: u32, homogeneous_coords: vec4<f32>) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    let texel = 1.0 / 2048.0;
    let eps = 1e-5;
    let uv_clamped = clamp(light_local, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
    
    return textureSampleCompareLevel(
        light_directional_shadow_texture_array, sampler_compare, uv_clamped, i32(cascade_id), depth
    );
}

fn fetch_light_spot_shadow(light_index: u32, homogeneous_coords: vec4<f32>) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    if (light_local.x < 0.0 || light_local.x > 1.0 || 
        light_local.y < 0.0 || light_local.y > 1.0 ||
        depth < 0.0 || depth > 1.0) {
        return 0.0;
    }
    
    let texel = 1.0 / 1024.0;
    let eps = 1e-5;
    let uv_clamped = clamp(light_local, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
    
    return textureSampleCompareLevel(
        light_spot_shadow_texture_array, sampler_compare, uv_clamped, i32(light_index), depth
    );
}