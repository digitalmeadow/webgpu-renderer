// Lighting Pass Shader with Shadow Support
// Reads from G-Buffer and outputs lit color with cascaded shadow mapping

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

// G-Buffer inputs (group 0)
@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var gbuffer_albedo: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_normal: texture_2d<f32>;
@group(0) @binding(3) var gbuffer_metallic_roughness: texture_2d<f32>;
@group(0) @binding(4) var gbuffer_depth: texture_depth_2d;
@group(0) @binding(5) var gbuffer_emissive: texture_2d<f32>;

// Camera uniforms (group 1)
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

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

// Directional Light Uniforms (group 2)
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

@group(2) @binding(0) var sampler_compare: sampler_comparison;
@group(2) @binding(1) var<uniform> light_directional_uniforms: LightDirectionalUniformsArray;
@group(2) @binding(2) var light_directional_shadow_texture: texture_depth_2d_array;
@group(2) @binding(3) var<uniform> light_spot_uniforms: LightSpotUniformsArray;
@group(2) @binding(4) var light_spot_shadow_texture: texture_depth_2d_array;

// Scene (group 3)
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



@group(3) @binding(0) var<uniform> scene_uniforms: SceneUniforms;
@group(3) @binding(1) var skyboxTexture: texture_cube<f32>;
@group(3) @binding(2) var skyboxSampler: sampler;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

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

// Reconstruct view-space position from depth buffer
fn position_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc_x = uv.x * 2.0 - 1.0;
    let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
    let ndc_z = depth;

    let clip_pos = vec4<f32>(ndc_x, ndc_y, ndc_z, 1.0);
    let view_pos = camera_uniforms.projection_matrix_inverse * clip_pos;

    return view_pos.xyz / view_pos.w;
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

// Fetch directional shadow
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

// Fetch spot shadow
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
    let schlick = 1.5; // Typically 5 for PBR for 1 to boost angles
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, schlick);

    // Reduce specular contribution at high roughness
    let roughness_factor = 1.0 - roughness * roughness;

    return env_color * fresnel * roughness_factor;
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample G-Buffer
    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_sample = textureSample(gbuffer_normal, sampler_linear, in.uv_coords);
    let metal_rough = textureSample(gbuffer_metallic_roughness, sampler_linear, in.uv_coords);
    let metalness = metal_rough.b;
    let roughness = metal_rough.g;
    let emissive = textureSample(gbuffer_emissive, sampler_linear, in.uv_coords).rgb;
    let depth = textureLoad(gbuffer_depth, vec2<i32>(in.uv_coords * vec2<f32>(textureDimensions(gbuffer_depth))), 0);

    // Reconstruct view-space position
    let view_pos = position_from_depth(in.uv_coords, depth);

    // Transform to world space
    let inverse_view = camera_uniforms.view_matrix_inverse;
    let world_pos = (inverse_view * vec4(view_pos, 1.0)).xyz;
    var world_normal = normalize(normal_sample.rgb);

    // Fallback to up vector if normal is invalid (all zeros or NaN)
    let normal_mag = dot(world_normal, world_normal);
    if (normal_mag < 0.001 || normal_mag != normal_mag) {
        world_normal = vec3<f32>(0.0, 1.0, 0.0);
    }

    // Diffuse IBL (sampled at high mip = blurry/omnidirectional)
    let ibl_color = sample_ibl(world_normal) * scene_uniforms.ibl_intensity;
    let ambient = scene_uniforms.ambient_light_color.rgb + ibl_color;

    // Metals have no diffuse response; dielectrics lose energy to specular via fresnel
    let diffuse_albedo = albedo * (1.0 - metalness);
    var color = diffuse_albedo * ambient;

    // Specular IBL (environment reflection)
    let specular = sample_specular_ibl(world_pos, world_normal, roughness, metalness, albedo) * scene_uniforms.ibl_intensity;

    for (var i: u32 = 0u; i < light_directional_uniforms.light_count; i++) {
        let light_uniforms = light_directional_uniforms.lights[i];

        if light_uniforms.color.a > 0.0 {
            let light_dir = normalize(-light_uniforms.direction.xyz);
            let diffuse = max(0.0, dot(world_normal, light_dir));

            // Directional light with cascade shadow
            let view_space_z = -view_pos.z;
            let cascade = select_cascade(view_space_z, light_uniforms.cascade_splits);

            let shadow_matrix = light_uniforms.view_projection_matrices[cascade];
            let shadow_coords = shadow_matrix * vec4<f32>(world_pos, 1.0);

            let shadow = fetch_light_directional_shadow(i, cascade, shadow_coords, in.position.xy);

            color += diffuse_albedo * light_uniforms.color.rgb * light_uniforms.color.a * shadow * diffuse;
        }
    }

    // Spot lights
    for (var j: u32 = 0u; j < light_spot_uniforms.light_count; j++) {
        let light_spot = light_spot_uniforms.lights[j];

        if light_spot.color_intensity.a > 0.0 {
            // Transform world position to light space
            let shadow_coords = light_spot.view_projection_matrix * vec4<f32>(world_pos, 1.0);

            // Sample shadow map
            let shadow = fetch_light_spot_shadow(j, world_pos, light_spot.view_matrix, shadow_coords, in.position.xy);

            // Calculate light direction (light → fragment)
            let light_dir = normalize(light_spot.position.xyz - world_pos);

            // Light forward direction (should already be light → forward)
            let forward = normalize(light_spot.forward.xyz);
            let prenumbra_percent = light_spot.fov_prenumbra.y;

            // Extract shadow UV from shadow coords (already aspect-correct)
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
            // shadow_coords.w contains perspective-correct depth where w ≈ -view_z
            // This gives us the linear distance from the spotlight
            let light_distance = shadow_coords.w;
            let spot_far = light_spot.near_far.y;
            let normalized_dist_from_light = clamp(light_distance / spot_far, 0.0, 1.0);
            let dist_falloff = (1.0 - normalized_dist_from_light) / (1.0 + normalized_dist_from_light * normalized_dist_from_light);

            // Diffuse lighting
            let diffuse = max(0.0, dot(world_normal, light_dir));

            // Accumulate light contribution
            color += diffuse_albedo * light_spot.color_intensity.rgb * light_spot.color_intensity.a * diffuse * shadow * spot_factor * dist_falloff;
        }
    }

    // Add specular environment reflections and emissive (unaffected by shadow/lights)
    color += specular;
    color += emissive;

    // Fog: https://iquilezles.org/articles/fog/
    // Distance from camera to fragment
    let dist = length(view_pos);

    // View direction (camera → point in world space)
    let view_dir = normalize(world_pos - camera_uniforms.position.xyz);

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
        // This is: light that survived + light scattered in from fog
        color = color * extinction + fog_color * (vec3<f32>(1.0) - ins);
    }
    
    output.color = vec4<f32>(color, 1.0);
    // output.color = vec4<f32>(world_normal * 0.5 + 0.5, 1.0); // Normalize to 0-1 range
    // output.color = vec4<f32>(ibl_color, 1.0);
    // let mag = length(world_normal);
    // output.color = vec4<f32>(vec3(mag), 1.0);
    // let NdotV = abs(dot(world_normal, normalize(camera_uniforms.position.xyz - world_pos)));
    // output.color = vec4<f32>(vec3(NdotV), 1.0);
        return output;
}
