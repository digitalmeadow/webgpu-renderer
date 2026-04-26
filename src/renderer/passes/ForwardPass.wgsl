// Forward Pass Shader for transparent objects
// Renders transparent meshes with scene lighting and shadows
// Aligned with LightingPass.wgsl

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) world_tangent: vec4<f32>,
};

// Camera uniforms (group 0)
struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

struct InstanceInput {
    @location(6) model_matrix_0: vec4<f32>,
    @location(7) model_matrix_1: vec4<f32>,
    @location(8) model_matrix_2: vec4<f32>,
    @location(9) model_matrix_3: vec4<f32>,
    @location(10) billboard_axis: u32,
    @location(11) custom_data_0: vec4<f32>,
    @location(12) custom_data_1: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// Light + Scene (group 1) - combined matching LightingPass structure
struct SceneUniforms {
    ambient_light_color: vec3<f32>,
    ibl_intensity: f32,

    fog_color_base: vec3<f32>,
    // 16 byte alignment

    fog_color_sun: vec3<f32>,
    // 16 byte alignment

    fog_extinction: vec3<f32>,
    // 16 byte alignment

    fog_inscattering: vec3<f32>,
    // 16 byte alignment

    fog_sun_exponent: f32,
    fog_enabled: u32,
    // 16 byte alignment
}

const MAX_DIRECTIONAL_LIGHTS: u32 = 4;

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_index: u32,
};

struct LightDirectionalUniformsArray {
    lights: array<LightDirectionalUniforms, MAX_DIRECTIONAL_LIGHTS>,
    light_count: u32,
};

const MAX_SPOT_LIGHTS: u32 = 8;

struct LightSpotUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near_far: vec4<f32>,
    color_intensity: vec4<f32>,
    forward: vec4<f32>,
    fov_penumbra: vec4<f32>,
    aspect_radius: vec4<f32>,
}

struct LightSpotUniformsArray {
    lights: array<LightSpotUniforms, MAX_SPOT_LIGHTS>,
    light_count: u32,
};

@group(1) @binding(0) var<uniform> scene_uniforms: SceneUniforms;
@group(1) @binding(1) var sampler_compare: sampler_comparison;
@group(1) @binding(2) var<uniform> light_directional_uniforms: LightDirectionalUniformsArray;
@group(1) @binding(3) var light_directional_shadow_texture: texture_depth_2d_array;
@group(1) @binding(4) var<uniform> light_spot_uniforms: LightSpotUniformsArray;
@group(1) @binding(5) var light_spot_shadow_texture: texture_depth_2d_array;
@group(1) @binding(6) var skyboxTexture: texture_cube<f32>;
@group(1) @binding(7) var skyboxSampler: sampler;

// Material uniforms (group 2) — aligned with GeometryPass binding names
struct MaterialUniforms {
    color: vec4<f32>,
    opacity: f32,
    environment_texture_id: f32,
    // padding: 2 floats
    @align(16) emissive: vec4<f32>,
    alpha_cutoff: f32,
    use_dithering: f32,
    // padding: 2 floats
}

@group(2) @binding(0) var nearestSampler: sampler;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;
@group(2) @binding(2) var normalTexture: texture_2d<f32>;
@group(2) @binding(3) var metalnessRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var<uniform> material: MaterialUniforms;
@group(2) @binding(5) var environmentTexture: texture_cube<f32>;
@group(2) @binding(6) var envSampler: sampler;
@group(2) @binding(7) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(8) var linearSampler: sampler;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(5) tangent: vec4<f32>,
};

fn get_billboard_axis(axis: u32) -> vec3<f32> {
    return select(
        select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), axis == 1u),
        vec3<f32>(0.0, 1.0, 0.0),
        axis == 2u
    );
}

fn compute_billboard_orientation(mesh_pos: vec3<f32>, axisVec: vec3<f32>) -> mat3x3<f32> {
    let forward = normalize(camera.position.xyz - mesh_pos);

    let forwardDotAxis = dot(forward, axisVec);
    let is_edge_case = abs(forwardDotAxis) > 0.995;

    var safe_forward = forward;
    if (is_edge_case) {
        let axis_component = select(0.0, 1.0, abs(axisVec.x) > 0.5);
        let default_fwd = select(
            vec3<f32>(0.0, 0.0, 1.0),
            vec3<f32>(1.0, 0.0, 0.0),
            axis_component > 0.5
        );
        safe_forward = default_fwd - axisVec * dot(default_fwd, axisVec);
        safe_forward = normalize(safe_forward);
    }

    let right = normalize(cross(axisVec, safe_forward));
    let up = axisVec;
    let billboard_forward = safe_forward;

    return mat3x3<f32>(right, up, billboard_forward);
}

//--HOOK_PLACEHOLDER_UNIFORMS--//

fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, nearestSampler, uv);
}

fn modify_albedo(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    return color;
}

fn vertex_post_process(world_pos: vec3<f32>, uv: vec2<f32>, instance: InstanceInput) -> vec3<f32> {
    return world_pos;
}

@vertex
fn vs_main(in: VertexInput, instance: InstanceInput) -> VertexOutput {
    var out: VertexOutput;

    let model_matrix = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );

    let mesh_pos = model_matrix[3].xyz;

    if (instance.billboard_axis != 0u) {
        let axisVec = get_billboard_axis(instance.billboard_axis);
        let billboard_matrix = compute_billboard_orientation(mesh_pos, axisVec);

        let billboarded_pos = billboard_matrix * in.position;
        let billboarded_normal = billboard_matrix * in.normal;
        let billboarded_tangent = billboard_matrix * in.tangent.xyz;

        out.world_position = mesh_pos + billboarded_pos;
        // Billboard normals/tangents are already in world space
        out.world_normal = billboarded_normal;
        out.world_tangent = vec4<f32>(billboarded_tangent, in.tangent.w);
    } else {
        let world_position = model_matrix * vec4<f32>(in.position, 1.0);
        out.world_position = world_position.xyz;
        out.world_normal = (model_matrix * vec4<f32>(in.normal, 0.0)).xyz;
        // Preserve tangent.w (handedness); w=0 in the transformed vec4 is intentional (direction, not point)
        out.world_tangent = vec4<f32>((model_matrix * vec4<f32>(in.tangent.xyz, 0.0)).xyz, in.tangent.w);
    }

    out.uv_coords = in.uv;

    out.world_position = vertex_post_process(out.world_position, in.uv, instance);

    out.position = camera.view_projection_matrix * vec4<f32>(out.world_position, 1.0);
    return out;
}

// Vogel disk sampling for shadow smoothing
const TAU: f32 = 6.283185307179586;
const GOLDEN_ANGLE: f32 = 3.883222077450933;
const VOGEL_SAMPLES: u32 = 12u;
const FILTER_RADIUS: f32 = 8.0;

fn ign(px: i32, py: i32) -> f32 {
    let fx = f32(px);
    let fy = f32(py);
    return fract(52.9829189 * fract(0.06711056 * fx + 0.00583715 * fy));
}

fn vogel_offset(i: u32, n: u32, rotation: f32) -> vec2<f32> {
    let f_i = f32(i);
    let f_n = f32(n);
    let r = sqrt((f_i + 0.5) / f_n);
    let th = rotation + f_i * GOLDEN_ANGLE;
    return vec2<f32>(cos(th), sin(th)) * r;
}

fn select_cascade(view_space_z: f32, splits: vec4<f32>) -> u32 {
    let depth = abs(view_space_z);

    if depth < splits.y {
        return 0u;
    } else if depth < splits.z {
        return 1u;
    } else {
        return 2u;
    }
}

fn fetch_light_directional_shadow(light_index: u32, cascade_id: u32, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    if homogeneous_coords.w <= 0.0 {
        return 1.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    if light_local.x < 0.0 || light_local.x > 1.0 || light_local.y < 0.0 || light_local.y > 1.0 || depth < 0.0 || depth > 1.0 {
        return 1.0;
    }

    let layer_index = light_index * 3u + cascade_id;

    let px = i32(floor(frag_coord.x));
    let py = i32(floor(frag_coord.y));
    let rotation = TAU * ign(px, py);
    let texel = 1.0 / 2048.0;

    var sum = 0.0;
    let eps = 1e-5;

    for (var i = 0u; i < VOGEL_SAMPLES; i = i + 1u) {
        let o = vogel_offset(i, VOGEL_SAMPLES, rotation);
        let uv = light_local + o * texel * FILTER_RADIUS;
        let uv_clamped = clamp(uv, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
        sum = sum + textureSampleCompareLevel(
            light_directional_shadow_texture, sampler_compare, uv_clamped, i32(layer_index), depth
        );
    }

    return sum / f32(VOGEL_SAMPLES);
}

fn fetch_light_directional_shadow_blended(
    light_index: u32,
    light_uniforms: LightDirectionalUniforms,
    world_pos: vec3<f32>,
    view_space_z: f32,
    frag_coord: vec2<f32>
) -> f32 {
    const BLEND_WIDTH: f32 = 0.3;

    let depth = abs(view_space_z);
    let splits = light_uniforms.cascade_splits;

    var cascade0: u32;
    var cascade1: u32;
    var blend_factor: f32 = 0.0;
    var in_blend_zone = false;

    if depth < splits.y {
        cascade0 = 0u;
        let range = splits.y - splits.x;
        let blend_start = splits.y - range * BLEND_WIDTH;
        if depth > blend_start {
            cascade1 = 1u;
            blend_factor = smoothstep(blend_start, splits.y, depth);
            in_blend_zone = true;
        }
    } else if depth < splits.z {
        cascade0 = 1u;
        let range = splits.z - splits.y;
        let blend_start = splits.z - range * BLEND_WIDTH;
        if depth > blend_start {
            cascade1 = 2u;
            blend_factor = smoothstep(blend_start, splits.z, depth);
            in_blend_zone = true;
        }
    } else {
        cascade0 = 2u;
    }

    let shadow_matrix0 = light_uniforms.view_projection_matrices[cascade0];
    let shadow_coords0 = shadow_matrix0 * vec4<f32>(world_pos, 1.0);
    let shadow0 = fetch_light_directional_shadow(light_index, cascade0, shadow_coords0, frag_coord);

    if in_blend_zone {
        let shadow_matrix1 = light_uniforms.view_projection_matrices[cascade1];
        let shadow_coords1 = shadow_matrix1 * vec4<f32>(world_pos, 1.0);
        let shadow1 = fetch_light_directional_shadow(light_index, cascade1, shadow_coords1, frag_coord);

        return mix(shadow0, shadow1, blend_factor);
    }

    return shadow0;
}

fn fetch_light_spot_shadow(light_index: u32, world_pos: vec3<f32>, view_matrix: mat4x4<f32>, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    let light_view_pos = view_matrix * vec4<f32>(world_pos, 1.0);

    if light_view_pos.z <= 0.0 {
        return 0.0;
    }

    if homogeneous_coords.w <= 0.0 {
        return 0.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    if light_local.x < 0.0 || light_local.x > 1.0 || light_local.y < 0.0 || light_local.y > 1.0 || depth < 0.0 || depth > 1.0 {
        return 1.0;
    }

    let px = i32(floor(frag_coord.x));
    let py = i32(floor(frag_coord.y));
    let rotation = TAU * ign(px, py);
    let texel = 1.0 / 1024.0;

    var sum = 0.0;
    let eps = 1e-5;

    for (var i = 0u; i < VOGEL_SAMPLES; i = i + 1u) {
        let o = vogel_offset(i, VOGEL_SAMPLES, rotation);
        let uv = light_local + o * texel * FILTER_RADIUS;
        let uv_clamped = clamp(uv, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
        sum = sum + textureSampleCompareLevel(
            light_spot_shadow_texture, sampler_compare, uv_clamped, i32(light_index), depth
        );
    }

    return sum / f32(VOGEL_SAMPLES);
}

fn sample_ibl(normal: vec3<f32>) -> vec3<f32> {
    let num_mips = f32(textureNumLevels(environmentTexture));
    let diffuse_mip = clamp(num_mips * 0.4, 0.0, num_mips - 1.0);
    return textureSampleLevel(environmentTexture, envSampler, normal, diffuse_mip).rgb;
}

fn sample_specular_ibl(world_pos: vec3<f32>, world_normal: vec3<f32>, roughness: f32, metalness: f32, albedo: vec3<f32>) -> vec3<f32> {
    let V = normalize(camera.position.xyz - world_pos);
    let N = normalize(world_normal);
    let R = reflect(-V, N);
    let NdotV = max(dot(N, V), 0.0);

    let num_mips = f32(textureNumLevels(environmentTexture));
    let mip = roughness * roughness * (num_mips - 1.0);
    let env_color = textureSampleLevel(environmentTexture, envSampler, R, mip).rgb;

    let dielectric_F0 = vec3<f32>(0.15);
    let F0 = mix(vec3<f32>(dielectric_F0), albedo, metalness);
    let schlick = 1.5;
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, schlick);

    let roughness_factor = 1.0 - roughness * roughness;

    return env_color * fresnel * roughness_factor;
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    let albedo_tex = modify_albedo(get_albedo_color(in.uv_coords), in.uv_coords);
    let normal_tex = textureSample(normalTexture, nearestSampler, in.uv_coords);
    let metal_rough = textureSample(metalnessRoughnessTexture, nearestSampler, in.uv_coords);

    let metalness = metal_rough.r;
    let roughness = metal_rough.g;
    let albedo = vec4<f32>(albedo_tex.rgb * material.color.rgb, albedo_tex.a);

    var world_normal = normalize(in.world_normal);
    let normal_sample = normal_tex.rgb;
    let normal_mag = dot(normal_sample, normal_sample);
    if (normal_mag > 0.001) {
        let N = normalize(in.world_normal);
        let T = normalize(in.world_tangent.xyz - dot(in.world_tangent.xyz, N) * N);
        let B = cross(N, T) * in.world_tangent.w;
        let TBN = mat3x3(T, B, N);

        var N_tangent = normal_sample * 2.0 - 1.0;
        // Convert OpenGL (Y-up) → WebGPU/DirectX (Y-down)
        N_tangent.y = -N_tangent.y;
        world_normal = normalize(TBN * N_tangent);
    }

    let nmag = dot(world_normal, world_normal);
    if (nmag < 0.001 || nmag != nmag) {
        world_normal = vec3<f32>(0.0, 1.0, 0.0);
    }

    let ibl_color = sample_ibl(world_normal) * scene_uniforms.ibl_intensity;
    let ambient = scene_uniforms.ambient_light_color.rgb + ibl_color;

    let diffuse_albedo = albedo.rgb * (1.0 - metalness);
    var color = diffuse_albedo * ambient;

    let specular = sample_specular_ibl(in.world_position, world_normal, roughness, metalness, albedo.rgb);

    for (var i: u32 = 0u; i < light_directional_uniforms.light_count; i++) {
        let light_uniforms = light_directional_uniforms.lights[i];

        if light_uniforms.color.a > 0.0 {
            let light_dir = normalize(-light_uniforms.direction.xyz);
            let diffuse = max(0.0, dot(world_normal, light_dir));

            let view_pos = camera.view_matrix * vec4<f32>(in.world_position, 1.0);
            let view_space_z = view_pos.z;

            let shadow = fetch_light_directional_shadow_blended(i, light_uniforms, in.world_position, view_space_z, in.position.xy);

            color += diffuse_albedo * light_uniforms.color.rgb * light_uniforms.color.a * shadow * diffuse;
        }
    }

    for (var j: u32 = 0u; j < light_spot_uniforms.light_count; j++) {
        let light_spot = light_spot_uniforms.lights[j];

        if light_spot.color_intensity.a > 0.0 {
            let shadow_coords = light_spot.view_projection_matrix * vec4<f32>(in.world_position, 1.0);

            let shadow = fetch_light_spot_shadow(j, in.world_position, light_spot.view_matrix, shadow_coords, in.position.xy);

            let light_to_frag = light_spot.position.xyz - in.world_position;
            let light_dir = normalize(light_to_frag);

            let penumbra_percent = light_spot.fov_penumbra.y;

            let proj_correction = 1.0 / shadow_coords.w;
            let shadow_uv = shadow_coords.xy * vec2<f32>(0.5, -0.5) * proj_correction + vec2<f32>(0.5, 0.5);
            let uv_centered = shadow_uv - vec2<f32>(0.5, 0.5);

            let radius = light_spot.aspect_radius.y;

            let p = uv_centered * 2.0;

            let rect_factor = max(abs(p.x), abs(p.y));
            let radial_dist = length(vec2<f32>(p.x, p.y));

            var normalized_dist = mix(rect_factor, radial_dist, radius);

            let spot_factor = smoothstep(1.0, 1.0 - penumbra_percent, normalized_dist);

            let light_distance = shadow_coords.w;
            let spot_far = light_spot.near_far.y;
            let normalized_dist_from_light = clamp(light_distance / spot_far, 0.0, 1.0);
            let dist_falloff = (1.0 - normalized_dist_from_light) / (1.0 + normalized_dist_from_light * normalized_dist_from_light);

            let diffuse = max(0.0, dot(world_normal, light_dir));

            color += diffuse_albedo * light_spot.color_intensity.rgb * light_spot.color_intensity.a * diffuse * shadow * spot_factor * dist_falloff;
        }
    }

    color += specular;

    // Fog
    let view_pos = camera.view_matrix * vec4<f32>(in.world_position, 1.0);
    let dist = length(view_pos.xyz);

    let view_dir = normalize(in.world_position - camera.position.xyz);

    var has_sun = light_directional_uniforms.light_count > 0u;
    var sun_dir = vec3<f32>(0.0, 1.0, 0.0);
    if (has_sun) {
        let light0 = light_directional_uniforms.lights[0];
        sun_dir = normalize(-light0.direction.xyz);
    }

    var sun_amount = 1.0;
    var fog_color = scene_uniforms.fog_color_base.rgb;
    if (bool(scene_uniforms.fog_enabled) && has_sun) {
        sun_amount = max(dot(view_dir, sun_dir), 0.0);
        let sun_tint = pow(sun_amount, scene_uniforms.fog_sun_exponent);
        fog_color = mix(scene_uniforms.fog_color_base.rgb, scene_uniforms.fog_color_sun.rgb, sun_tint);
    }

    if (bool(scene_uniforms.fog_enabled)) {
        let be = scene_uniforms.fog_extinction;
        let bi = scene_uniforms.fog_inscattering;

        let extinction = exp(-dist * be);
        let ins = vec3<f32>(
            exp(-dist * bi.x),
            exp(-dist * bi.y),
            exp(-dist * bi.z)
        );

        color = color * extinction + fog_color * (vec3<f32>(1.0) - ins);
    }

    output.color = vec4<f32>(color, albedo.a * material.opacity);

    return output;
}
