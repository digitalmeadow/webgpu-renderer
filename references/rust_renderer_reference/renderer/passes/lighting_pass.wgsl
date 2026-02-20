struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Procedurally generate the triangle's vertices
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0), // Bottom-left
        vec2<f32>(3.0, -1.0),  // Bottom-right (extends beyond the screen)
        vec2<f32>(-1.0, 3.0),  // Top-left (extends beyond the screen)
    );

    // Map vertex positions to texture coordinates
    var uv_coords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0), // Bottom-left
        vec2<f32>(2.0, 1.0), // Bottom-right (extends beyond the screen)
        vec2<f32>(0.0, -1.0), // Top-left (extends beyond the screen)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = uv_coords[vertex_index];
    return output;
}

const MAX_LIGHT_DIRECTIONAL_COUNT: u32 = 2;
const MAX_LIGHT_SPOT_COUNT: u32 = 8;

// Uniforms
// Context uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0) var<uniform> context_uniforms: ContextUniforms;

// G-Buffer inputs
@group(1) @binding(1) var geometry_buffer_albedo_metalness_texture: texture_2d<f32>;
@group(1) @binding(2) var geometry_buffer_normal_roughness_texture: texture_2d<f32>;
@group(1) @binding(3) var geometry_buffer_depth_texture: texture_depth_2d;

// Camera uniforms
struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(2) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

// Light uniforms
struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>, // 3 cascades
    cascade_splits: vec4<f32>, // [split0, split1, split2, split3] (z values in view/camera space)
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

@group(3) @binding(0) var sampler_linear: sampler;
@group(3) @binding(1) var sampler_compare: sampler_comparison;
@group(3) @binding(2) var<uniform> light_directionals: array<LightDirectionalUniforms, 2>;  // Match MAX_LIGHT_DIRECTIONAL_COUNT
@group(3) @binding(3) var light_directional_shadow_texture_array: texture_depth_2d_array;
@group(3) @binding(4) var<uniform> light_spots: array<LightSpotUniforms, 8>;  // Match MAX_LIGHT_SPOT_COUNT
@group(3) @binding(5) var light_spot_shadow_texture_array: texture_depth_2d_array;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample G-Buffer
    let albedo_metalness = textureSample(geometry_buffer_albedo_metalness_texture, sampler_linear, in.uv_coords);
    let albedo = albedo_metalness.rgb;
    let metalness = albedo_metalness.a;

    let normal_roughness = textureSample(geometry_buffer_normal_roughness_texture, sampler_linear, in.uv_coords);
    let normal_view = normal_roughness.rgb;
    let roughness = normal_roughness.a;

    let depth = textureSample(geometry_buffer_depth_texture, sampler_linear, in.uv_coords);
    let position = position_from_depth(in.uv_coords, depth);
    
    // Extract view-space position and normal
    let view_pos = position.xyz;
    let normal_view_normalized = normalize(normal_view);
    
    // Transform view-space position back to world space for shadow calculations
    let inverse_view = inverse_mat4(camera_uniforms.view_matrix);
    let world_pos = (inverse_view * vec4(view_pos, 1.0)).xyz;

    // Transform view-space normal to world space
    let world_normal = normalize((inverse_view * vec4(normal_view_normalized, 0.0)).xyz);
    
    var color = vec3(0.0);
    
    // Directional light + shadows
    for (var i = 0u; i < MAX_LIGHT_DIRECTIONAL_COUNT; i += 1u) {
        let light = light_directionals[i];
        
        // Select cascade based on view-space depth
        let view_space_z = -view_pos.z;  // Negate because view space z is negative
        let cascade = select_cascade(view_space_z, light.cascade_splits);
        
        // Transform world position to light space
        let shadow_matrix = light.view_projection_matrices[cascade];
        let shadow_coords = shadow_matrix * vec4(world_pos, 1.0);
        
        // Sample shadow map
        let shadow_layer = i * 3u + cascade;  // light_index * NUM_CASCADES + cascade
        let shadow = fetch_light_directional_shadow(shadow_layer, shadow_coords, in.position.xy);

        // Diffuse lighting
        let light_dir = normalize(-light.direction.xyz);
        let diffuse = max(0.0, dot(world_normal, light_dir));
        
        // Accumulate light contribution
        let intensity = light.color.a;
        color += light.color.rgb * shadow * diffuse * albedo.rgb * intensity;
    }

    // Spotlight + shadows
    for (var j = 0u; j < MAX_LIGHT_SPOT_COUNT; j += 1u) {
        let light_spot = light_spots[j];

        // Skip inactive lights (intensity == 0)
        if (light_spot.color_intensity.a <= 0.5) {
            continue;
        }

        // Transform world position to light space
        let shadow_coords = light_spot.view_projection_matrix * vec4(world_pos, 1.0);

        // Skip fragments behind the light
        if (shadow_coords.w <= 0.0) {
            continue;
        }
        
        // Sample shadow map (each spotlight has 1 layer)
        let shadow_layer = j;  // Simple: spotlight index = layer index

        let shadow = fetch_light_spot_shadow(shadow_layer, shadow_coords, in.position.xy);
        
        // Calculate light direction
        let light_to_frag = world_pos - light_spot.position.xyz;
        let light_dir = normalize(-light_to_frag);
        
        // Diffuse lighting
        let diffuse = max(0.0, dot(world_normal, light_dir));
        
        // Accumulate light contribution
        let intensity = light_spot.color_intensity.a;
        color += light_spot.color_intensity.rgb * shadow * diffuse * albedo.rgb * intensity;
    }
        
    // Ambient lighting
    let ambient = vec3(0.15);
    color += ambient * albedo.rgb;
    
    return vec4(color, 1.0);
}

// Reconstruct view-space position from depth buffer
fn position_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    // Convert UV and depth to NDC coordinates
    let ndc_x = uv.x * 2.0 - 1.0;
    let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;  // Flip Y for texture coords
    let ndc_z = depth;
    
    // Create clip-space position
    let clip_pos = vec4<f32>(ndc_x, ndc_y, ndc_z, 1.0);
    
    // Inverse projection to get view-space position
    // For perspective projection: multiply by inverse projection matrix
    let view_pos = camera_uniforms.projection_matrix_inverse * clip_pos;
    
    // Perspective divide
    return view_pos.xyz / view_pos.w;
}

// Helper: 4x4 matrix inverse (simplified for view matrices)
fn inverse_mat4(m: mat4x4<f32>) -> mat4x4<f32> {
    // For view matrices, inverse is approximately the transpose of rotation + negated translation
    // This is a simplified version - for production you'd want a proper inverse
    let inv_rot = transpose(mat3x3<f32>(
        m[0].xyz,
        m[1].xyz,
        m[2].xyz
    ));
    
    let inv_trans = -(inv_rot * m[3].xyz);
    
    return mat4x4<f32>(
        vec4(inv_rot[0], 0.0),
        vec4(inv_rot[1], 0.0),
        vec4(inv_rot[2], 0.0),
        vec4(inv_trans, 1.0)
    );
}

fn select_cascade(view_space_z: f32, splits: vec4<f32>) -> u32 {
    if (view_space_z < splits.y) {
        return 0u;
    } else if (view_space_z < splits.z) {
        return 1u;
    } else {
        return 2u;
    }
}

fn ign(px: i32, py: i32) -> f32 {
    let fx = f32(px);
    let fy = f32(py);
    return fract(52.9829189 * fract(0.06711056 * fx + 0.00583715 * fy));
}

const TAU: f32 = 6.283185307179586;
const GOLDEN_ANGLE: f32 = 3.883222077450933;
const VOGEL_SAMPLES: u32 = 12u;
const FILTER_RADIUS: f32 = 2.0;

fn vogel_offset(i: u32, n: u32, rotation: f32) -> vec2<f32> {
    let f_i = f32(i);
    let f_n = f32(n);
    let r  = sqrt((f_i + 0.5) / f_n);
    let th = rotation + f_i * GOLDEN_ANGLE;
    return vec2<f32>(cos(th), sin(th)) * r;
}

fn fetch_light_directional_shadow(cascade_id: u32, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    let px = i32(floor(frag_coord.x));
    let py = i32(floor(frag_coord.y));
    let rotation = TAU * ign(px, py);
    let texel = 1.0 / 2048.0; // Match dimensions of shadow map
    
    var sum = 0.0;
    let eps = 1e-5;
    
    for (var i = 0u; i < VOGEL_SAMPLES; i = i + 1u) {
        let o = vogel_offset(i, VOGEL_SAMPLES, rotation);
        let uv = light_local + o * texel * FILTER_RADIUS;
        let uv_clamped = clamp(uv, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
        sum = sum + textureSampleCompareLevel(
            light_directional_shadow_texture_array, sampler_compare, uv_clamped, i32(cascade_id), depth
        );
    }
    
    return sum / f32(VOGEL_SAMPLES);
}

fn fetch_light_spot_shadow(light_index: u32, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    // Check if position is within spotlight frustum
    if (light_local.x < 0.0 || light_local.x > 1.0 || 
        light_local.y < 0.0 || light_local.y > 1.0 ||
        depth < 0.0 || depth > 1.0) {
        return 0.0;  // Outside spotlight cone
    }
    
    let px = i32(floor(frag_coord.x));
    let py = i32(floor(frag_coord.y));
    let rotation = TAU * ign(px, py);
    let texel = 1.0 / 1024.0; // Match dimensions of shadow map
    
    var sum = 0.0;
    let eps = 1e-5;
    
    for (var i = 0u; i < VOGEL_SAMPLES; i = i + 1u) {
        let o = vogel_offset(i, VOGEL_SAMPLES, rotation);
        let uv = light_local + o * texel * FILTER_RADIUS;
        let uv_clamped = clamp(uv, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
        sum = sum + textureSampleCompareLevel(
            light_spot_shadow_texture_array, sampler_compare, uv_clamped, i32(light_index), depth
        );
    }
    
    return sum / f32(VOGEL_SAMPLES);
}