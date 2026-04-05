// Forward Pass Shader for transparent objects
// Renders transparent meshes with scene lighting and shadows
// Aligned with LightingPass.wgsl

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv_coords: vec2<f32>,
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

@group(0) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

// Mesh uniforms (group 1)
struct MeshUniforms {
    model_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, 64>,
    apply_skinning: u32,
    billboardAxis: u32,
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

// Light + Scene (group 2) - combined matching LightingPass structure
// Scene uniforms
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

@group(2) @binding(0) var<uniform> scene_uniforms: SceneUniforms;

// Directional Light Uniforms
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

// Spot Light Uniforms
const MAX_SPOT_LIGHTS: u32 = 8;

struct LightSpotUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near_far: vec4<f32>,
    color_intensity: vec4<f32>,
    forward: vec4<f32>,
    fov_prenumbra: vec4<f32>,
    aspect_radius: vec4<f32>,
}

struct LightSpotUniformsArray {
    lights: array<LightSpotUniforms, MAX_SPOT_LIGHTS>,
    light_count: u32,
};

@group(2) @binding(1) var sampler_compare: sampler_comparison;
@group(2) @binding(2) var<uniform> light_directional_uniforms: LightDirectionalUniformsArray;
@group(2) @binding(3) var light_directional_shadow_texture: texture_depth_2d_array;
@group(2) @binding(4) var<uniform> light_spot_uniforms: LightSpotUniformsArray;
@group(2) @binding(5) var light_spot_shadow_texture: texture_depth_2d_array;

// Skybox for IBL
@group(2) @binding(6) var skyboxTexture: texture_cube<f32>;
@group(2) @binding(7) var skyboxSampler: sampler;

// Material uniforms (group 3)
struct MaterialUniforms {
    color: vec4<f32>,
    opacity: f32,
}

@group(3) @binding(0) var material_sampler: sampler;
@group(3) @binding(1) var albedo_texture: texture_2d<f32>;
@group(3) @binding(2) var normal_texture: texture_2d<f32>;
@group(3) @binding(3) var metalness_roughness_texture: texture_2d<f32>;
@group(3) @binding(4) var<uniform> material_uniforms: MaterialUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

fn get_billboard_axis(axis: u32) -> vec3<f32> {
    return select(
        select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), axis == 1u),
        vec3<f32>(0.0, 1.0, 0.0),
        axis == 2u
    );
}

fn compute_billboard_orientation(mesh_pos: vec3<f32>, axisVec: vec3<f32>) -> mat3x3<f32> {
    let forward = normalize(camera_uniforms.position.xyz - mesh_pos);

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

    let right = normalize(cross(safe_forward, axisVec));
    let up = axisVec;
    let billboard_forward = safe_forward;

    return mat3x3<f32>(right, up, billboard_forward);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    
    var local_pos = in.position;
    var local_normal = in.normal;
    
    // Extract world position directly from model matrix translation (column 4)
    let mesh_pos = mesh_uniforms.model_matrix[3].xyz;
    
    // Apply billboarding if enabled
    if (mesh_uniforms.billboardAxis != 0u) {
        let axisVec = get_billboard_axis(mesh_uniforms.billboardAxis);
        let billboard_matrix = compute_billboard_orientation(mesh_pos, axisVec);
        
        let billboarded_pos = billboard_matrix * in.position;
        let billboarded_normal = billboard_matrix * in.normal;
        out.position = camera_uniforms.view_projection_matrix * vec4<f32>(mesh_pos + billboarded_pos, 1.0);
        out.world_position = mesh_pos + billboarded_pos;
        // Billboard normal is already in world space - don't apply model matrix
        out.world_normal = billboarded_normal;
        out.uv_coords = in.uv;
        return out;
    }
    
    let world_position = mesh_uniforms.model_matrix * vec4<f32>(local_pos, 1.0);
    out.position = camera_uniforms.view_projection_matrix * world_position;
    out.world_position = world_position.xyz;
    out.world_normal = (mesh_uniforms.model_matrix * vec4<f32>(local_normal, 0.0)).xyz;
    out.uv_coords = in.uv;
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

// Select cascade based on view-space depth
fn select_cascade(view_space_z: f32, splits: vec4<f32>) -> u32 {
    if view_space_z < splits.y {
        return 0u;
    } else if view_space_z < splits.z {
        return 1u;
    } else {
        return 2u;
    }
}

// Fetch directional shadow with Vogel disk sampling
fn fetch_light_directional_shadow(light_index: u32, cascade_id: u32, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    if homogeneous_coords.w <= 0.0 {
        return 1.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    // Return fully lit for fragments outside the light frustum
    if light_local.x < 0.0 || light_local.x > 1.0 || light_local.y < 0.0 || light_local.y > 1.0 || depth < 0.0 || depth > 1.0 {
        return 1.0;
    }

    // Texture layers are organized as: [light0-c0, light0-c1, light0-c2, light1-c0, light1-c1, light1-c2, ...]
    let layer_index = light_index * 3u + cascade_id;

    // Vogel disk sampling for shadow smoothing
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

// Fetch spot shadow with Vogel disk sampling
fn fetch_light_spot_shadow(light_index: u32, world_pos: vec3<f32>, view_matrix: mat4x4<f32>, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    // Transform world position to light view space to check if behind the light
    let light_view_pos = view_matrix * vec4<f32>(world_pos, 1.0);

    // In right-handed view space, -Z is forward. Points behind the light have Z >= 0
    if light_view_pos.z >= 0.0 {
        return 0.0; // Behind the light - no contribution
    }

    // Points behind the NDC camera should not contribute to lighting
    if homogeneous_coords.w <= 0.0 {
        return 0.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    // Check if position is within spotlight frustum
    if light_local.x < 0.0 || light_local.x > 1.0 || light_local.y < 0.0 || light_local.y > 1.0 || depth < 0.0 || depth > 1.0 {
        return 1.0; // Outside spotlight frustum - fully lit
    }

    // Vogel disk sampling for shadow smoothing
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

// IBL (Image-Based Lighting) - sample skybox based on normal direction
fn sample_ibl(normal: vec3<f32>) -> vec3<f32> {
    let max_mip = 2.0;
    return textureSampleLevel(skyboxTexture, skyboxSampler, normal, max_mip).rgb;
}

// Specular IBL - environment reflection with Schlick fresnel
const MAX_ENV_MIP_LEVELS: f32 = 4.0;

fn sample_specular_ibl(world_pos: vec3<f32>, world_normal: vec3<f32>, roughness: f32, metalness: f32, albedo: vec3<f32>) -> vec3<f32> {
    let V = normalize(camera_uniforms.position.xyz - world_pos);
    let N = normalize(world_normal);
    let R = reflect(-V, N);
    let NdotV = max(dot(N, V), 0.0);

    // Roughness-based mip selection
    let mip = roughness * MAX_ENV_MIP_LEVELS;
    let env_color = textureSampleLevel(skyboxTexture, skyboxSampler, R, mip).rgb;

    // F0: dielectric uses 0.04, metals use albedo color
    let dielectric_F0 = vec3<f32>(0.15);
    let F0 = mix(vec3<f32>(dielectric_F0), albedo, metalness);
    // Schlick fresnel approximation
    let schlick = 1.5;
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, schlick);

    // Reduce specular contribution at high roughness
    let roughness_factor = 1.0 - roughness * roughness;

    return env_color * fresnel * roughness_factor;
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample textures
    let albedo_tex = textureSample(albedo_texture, material_sampler, in.uv_coords);
    let normal_tex = textureSample(normal_texture, material_sampler, in.uv_coords);
    let metal_rough = textureSample(metalness_roughness_texture, material_sampler, in.uv_coords);

    let metalness = metal_rough.r;
    let roughness = metal_rough.g;
    let albedo = vec4<f32>(albedo_tex.rgb * material_uniforms.color.rgb, albedo_tex.a);

    // Apply normal map - use tangent-space normal from texture
    var world_normal = normalize(in.world_normal);
    let normal_sample = normal_tex.rgb;
    let normal_mag = dot(normal_sample, normal_sample);
    if (normal_mag > 0.001) {
        // Tangent-space normal: transform to world space using TBN
        // For simplicity, add tangent-space offset to world normal
        // (proper implementation would require tangent attribute)
        let T = normalize(cross(in.world_normal, vec3<f32>(0.0, 1.0, 0.0)));
        let B = cross(in.world_normal, T);
        let TBN = mat3x3(T, B, in.world_normal);
        world_normal = normalize(TBN * (normal_sample * 2.0 - 1.0));
    }

    // Fallback to up vector if normal is invalid (all zeros or NaN)
    let nmag = dot(world_normal, world_normal);
    if (nmag < 0.001 || nmag != nmag) {
        world_normal = vec3<f32>(0.0, 1.0, 0.0);
    }

    // IBL - matching LightingPass
    let ibl_color = sample_ibl(world_normal) * scene_uniforms.ibl_intensity;
    let ambient = scene_uniforms.ambient_light_color.rgb + ibl_color;

    // PBR: metals have no diffuse response
    let diffuse_albedo = albedo.rgb * (1.0 - metalness);
    var color = diffuse_albedo * ambient;

    // Specular IBL
    let specular = sample_specular_ibl(in.world_position, world_normal, roughness, metalness, albedo.rgb) * scene_uniforms.ibl_intensity;

    // Directional lights
    for (var i: u32 = 0u; i < light_directional_uniforms.light_count; i++) {
        let light_uniforms = light_directional_uniforms.lights[i];

        if light_uniforms.color.a > 0.0 {
            let light_dir = normalize(-light_uniforms.direction.xyz);
            let diffuse = max(0.0, dot(world_normal, light_dir));

            // Get view-space Z for cascade selection
            let inv_view = camera_uniforms.view_matrix_inverse;
            let view_pos = camera_uniforms.view_matrix * vec4<f32>(in.world_position, 1.0);
            let view_space_z = -view_pos.z;
            let cascade = select_cascade(view_space_z, light_uniforms.cascade_splits);

            let shadow_matrix = light_uniforms.view_projection_matrices[cascade];
            let shadow_coords = shadow_matrix * vec4<f32>(in.world_position, 1.0);

            let shadow = fetch_light_directional_shadow(i, cascade, shadow_coords, in.position.xy);

            color += diffuse_albedo * light_uniforms.color.rgb * light_uniforms.color.a * shadow * diffuse;
        }
    }

    // Spot lights
    for (var j: u32 = 0u; j < light_spot_uniforms.light_count; j++) {
        let light_spot = light_spot_uniforms.lights[j];

        if light_spot.color_intensity.a > 0.0 {
            let shadow_coords = light_spot.view_projection_matrix * vec4<f32>(in.world_position, 1.0);

            let shadow = fetch_light_spot_shadow(j, in.world_position, light_spot.view_matrix, shadow_coords, in.position.xy);

            let light_to_frag = light_spot.position.xyz - in.world_position;
            let light_dir = normalize(light_to_frag);

            let prenumbra_percent = light_spot.fov_prenumbra.y;

            // Extract shadow UV from shadow coords
            let proj_correction = 1.0 / shadow_coords.w;
            let shadow_uv = shadow_coords.xy * vec2<f32>(0.5, -0.5) * proj_correction + vec2<f32>(0.5, 0.5);
            let uv_centered = shadow_uv - vec2<f32>(0.5, 0.5);

            // Get radius for rectangular to circular falloff
            let radius = light_spot.aspect_radius.y;

            let p = uv_centered * 2.0; // [-1,1]

            // Rectangular
            let rect_factor = max(abs(p.x), abs(p.y));
            let radial_dist = length(vec2<f32>(
                p.x,
                p.y
            ));

            // Blend
            var normalized_dist = mix(rect_factor, radial_dist, radius);

            // Apply prenumbra with smooth falloff
            let spot_factor = smoothstep(1.0, 1.0 - prenumbra_percent, normalized_dist);

            // Distance-based falloff using spotlight's frustum
            let light_distance = shadow_coords.w;
            let spot_far = light_spot.near_far.y;
            let normalized_dist_from_light = clamp(light_distance / spot_far, 0.0, 1.0);
            let dist_falloff = (1.0 - normalized_dist_from_light) / (1.0 + normalized_dist_from_light * normalized_dist_from_light);

            let diffuse = max(0.0, dot(world_normal, light_dir));

            color += diffuse_albedo * light_spot.color_intensity.rgb * light_spot.color_intensity.a * diffuse * shadow * spot_factor * dist_falloff;
        }
    }

    // Add specular IBL
    color += specular;

    // Fog - matching LightingPass
    // Distance from camera to fragment
    let view_pos = camera_uniforms.view_matrix * vec4<f32>(in.world_position, 1.0);
    let dist = length(view_pos.xyz);

    // View direction (camera → point in world space)
    let view_dir = normalize(in.world_position - camera_uniforms.position.xyz);

    // Sun direction (use first directional light)
    var has_sun = light_directional_uniforms.light_count > 0u;
    var sun_dir = vec3<f32>(0.0, 1.0, 0.0);
    if (has_sun) {
        let light0 = light_directional_uniforms.lights[0];
        sun_dir = normalize(-light0.direction.xyz);
    }

    // Sun tint factor based on view direction alignment with sun
    var sun_amount = 1.0;
    var fog_color = scene_uniforms.fog_color_base.rgb;
    if (bool(scene_uniforms.fog_enabled) && has_sun) {
        sun_amount = max(dot(view_dir, sun_dir), 0.0);
        let sun_tint = pow(sun_amount, scene_uniforms.fog_sun_exponent);
        fog_color = mix(scene_uniforms.fog_color_base.rgb, scene_uniforms.fog_color_sun.rgb, sun_tint);
    }

    // Full scattering model (per-channel extinction + inscattering)
    if (bool(scene_uniforms.fog_enabled)) {
        let be = scene_uniforms.fog_extinction;
        let bi = scene_uniforms.fog_inscattering;

        let extinction = exp(-dist * be);
        let ins = vec3<f32>(
            exp(-dist * bi.x),
            exp(-dist * bi.y),
            exp(-dist * bi.z)
        );

        // Final color: (pixel * extinction) + (fog_color * ins)
        color = color * extinction + fog_color * (vec3<f32>(1.0) - ins);
    }

    output.color = vec4<f32>(color, albedo.a * material_uniforms.opacity);

    return output;
}
