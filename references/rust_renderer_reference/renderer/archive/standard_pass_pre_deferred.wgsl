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
    @location(2) view_position: vec4<f32>,
    @location(3) uv_coords: vec2<f32>,
    @location(4) depth: f32,
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
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
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
    output.vertex_position = model_position;

    let view_position = camera_uniforms.view_matrix * model_position;
    output.view_position = view_position;

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

// Light uniforms
struct LightDirectional {
    view_projection_matrices: array<mat4x4<f32>, 3>, // 3 cascades
    cascade_splits: vec4<f32>, // [split0, split1, split2, split3] (z values in view/camera space)
    direction: vec3<f32>,
    active_view_projection_matrix: u32,
}

@group(2) @binding(0)
var<uniform> lights_directional: array<LightDirectional, 1>;

@group(2) @binding(1)
var shadow_sampler: sampler_comparison;

@group(2) @binding(2)
var shadow_texture_array: texture_depth_2d_array;

// Material
// Material uniforms
struct MaterialUniforms {
    gradient_map_enabled: u32,
    gradient_map_count: u32,
    gradient_map_index: u32,
}

@group(3) @binding(1)
var<uniform> material_uniforms: MaterialUniforms;

@group(3) @binding(2)
var albedo_sampler: sampler;

@group(3) @binding(3)
var albedo_texture: texture_2d<f32>;

@group(3) @binding(4)
var metalness_roughness_sampler: sampler;

@group(3) @binding(5)
var metalness_roughness_texture: texture_2d<f32>;

@group(3) @binding(6)
var environment_sampler: sampler;

@group(3) @binding(7)
var environment_texture: texture_cube<f32>;

@group(3) @binding(8)
var gradient_map_sampler: sampler;

@group(3) @binding(9)
var gradient_map_texture: texture_2d<f32>;

const max_lights_directional: u32 = 1;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
    @location(1) position: vec4<f32>,
    @location(2) normal: vec4<f32>,
};

// Fragment shader
@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    output.position = in.view_position;

    var debug = vec3(1.0, 1.0, 1.0);

    // Vectors
    let normal: vec3<f32> = normalize(in.vertex_normal.xyz);
    let view: vec3<f32> = normalize(camera_uniforms.position.xyz - in.vertex_position.xyz);  // Subtraction gets a vector pointing from the vertex to the eye
    let normal_view: vec3<f32> = (camera_uniforms.view_matrix * vec4(normal, 0.0)).xyz;

    output.normal = vec4(normal_view, 0.0);

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
    // Add reflection to albedo to lost less albedo color
    let reflection_albedo_mix = albedo.rgb + reflection.rgb;
    var color = mix(albedo.rgb, reflection_albedo_mix, reflectivity);

    // Shadows
    for (var i = 0u; i < min(1u, max_lights_directional); i += 1u) {
        let light = lights_directional[i];

        // Select cascade
        let view_space_z = in.view_position.z;
        let cascade = select_cascade(-view_space_z, light.cascade_splits);

        // Use the correct matrix for this cascade
        let shadow_matrix = light.view_projection_matrices[cascade];
        let shadow_coords = shadow_matrix * in.vertex_position;

        // Sample the correct layer in the shadow map array
        let shadow = fetch_shadow(cascade, shadow_coords, in.position.xy);

        let diffuse = max(0.0, dot(normal, normalize(-light.direction)));
        let light_tint_color = vec3<f32>(1.0, 1.0, 1.0);

        color *= shadow * diffuse * light_tint_color * albedo.rgb;
        // debug = vec3(view_space_z / 100.0);
        // debug = vec3(f32(cascade) / 3.0);
        // debug = color + vec3(f32(cascade) / 6.0);
        // debug = color;
        // debug = vec3(diffuse);

        // Debugging
        // output.color = vec4(f32(cascade) / 2.0, 0.0, 0.0, 1.0); // Will be Red: 0.0, 0.5, or 1.0
        // output.color = vec4(shadow, shadow, shadow, 1.0); // Will be a grayscale shadow map
    }

    // Ambient lighting (always added)
    let ambient = vec3(0.15);
    color += ambient * albedo.rgb;

    // Transparency via dithered fragment discarding
    let bayerDimensions = 4;
    let dithering_scale = 2.0;
    let x = i32(in.position.x / dithering_scale) % bayerDimensions;
    let y = i32(in.position.y / dithering_scale) % bayerDimensions;

    let threshold = bayerMatrix4x4[x][y] + 1.0 / f32(bayerDimensions * bayerDimensions) + 0.130;

    if (albedo.a < 1.0 && albedo.a < threshold) {
        discard;
    }

    // Gradient mapping
    let lighting_scalar = clamp(length(color.rgb) / 3.0, 0.0, 1.0);
    let gradient_selection = f32(material_uniforms.gradient_map_index) / max(1.0, f32(material_uniforms.gradient_map_count));
    // x-axis = color selection, y-axis = gradient selection
    let gradient_map_uv = vec2(lighting_scalar, gradient_selection);
    let color_mapped = textureSample(gradient_map_texture, gradient_map_sampler, gradient_map_uv);

    let color_decided = select(color, color_mapped.rgb, bool(material_uniforms.gradient_map_enabled));

    output.color = vec4(color_decided, 1.0);
    return output;
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
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

// TODO: Use actual shadow map size from uniforms
fn shadow_map_texel_size() -> f32 {
    // Set to your shadow map resolution
    return 1.0 / 2048.0;
}

fn shadow_compare(
    uv: vec2<f32>,
    cascade_id: u32,
    depth: f32
) -> f32 {
    return textureSampleCompareLevel(
        shadow_texture_array, shadow_sampler, uv, i32(cascade_id), depth
    );
}

fn ign(px: i32, py: i32) -> f32 {
    let fx = f32(px);
    let fy = f32(py);
    return fract(52.9829189 * fract(0.06711056 * fx + 0.00583715 * fy));
}

const TAU: f32 = 6.283185307179586;
const GOLDEN_ANGLE: f32 = 3.883222077450933; // PI * (3.0 - sqrt(5.0))
const VOGEL_SAMPLES: u32 = 12u;              // 8–20 is typical; 12 is a good start
const FILTER_RADIUS: f32 = 2.0;               // try 1.0–2.5 for softness vs cost

fn vogel_offset(i: u32, n: u32, rotation: f32) -> vec2<f32> {
    // r = sqrt((i + 0.5) / n), θ = rotation + i * GOLDEN_ANGLE
    let f_i = f32(i);
    let f_n = f32(n);
    let r  = sqrt((f_i + 0.5) / f_n);
    let th = rotation + f_i * GOLDEN_ANGLE;
    return vec2<f32>(cos(th), sin(th)) * r;
}

fn fetch_shadow(cascade_id: u32, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    // Outside of light view
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }

    // Flip the y of the look_at_rh
    let flip_correction = vec2<f32>(0.5, -0.5);

    // Compute texture coordinates for shadow lookup
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);

    let depth = homogeneous_coords.z * proj_correction;

    // IGN-jittered single-tap shadow compare
    // Derive stable per-pixel 2D jitter in [-0.5, 0.5]
    let px = i32(floor(frag_coord.x));
    let py = i32(floor(frag_coord.y));
    let rotation = TAU * ign(px, py);

    // Filter sizing in texels (tune these)
    let texel = shadow_map_texel_size();

    // Accumulate Vogel samples
    var sum = 0.0;
    let eps = 1e-5;

    for (var i = 0u; i < VOGEL_SAMPLES; i = i + 1u) {
        // Unit-disk Vogel offset rotated by per-pixel angle
        let o = vogel_offset(i, VOGEL_SAMPLES, rotation);
        // Scale by texel size and desired radius (in texels)
        let uv = light_local + o * texel * FILTER_RADIUS;
        // Keep inside texture domain
        let uv_clamped = clamp(uv, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));

        sum = sum + shadow_compare(uv_clamped, cascade_id, depth);
    }

    return sum / f32(VOGEL_SAMPLES);
}

const bayerMatrix4x4 = mat4x4(
    0.0,  8.0,  2.0, 10.0,
    12.0, 4.0,  14.0, 6.0,
    3.0,  11.0, 1.0, 9.0,
    15.0, 7.0,  13.0, 5.0
) / 16.0;