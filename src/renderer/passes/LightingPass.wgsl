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
    fov_penumbra: vec4<f32>,
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
@group(3) @binding(3) var environmentTexture1: texture_cube<f32>;  // First custom environment map
@group(3) @binding(4) var environmentSampler1: sampler;

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
    // Convert view-space Z to positive depth distance
    // In left-handed view space, camera looks down +Z, so objects in front have positive Z
    let depth = abs(view_space_z);
    
    if depth < splits.y {
        return 0u;
    } else if depth < splits.z {
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
    // WebGPU ortho matrix produces NDC Z in [0,1] directly
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

// Fetch directional shadow with cascade blending
// Blends between adjacent cascades in transition zones to eliminate hard edges
fn fetch_light_directional_shadow_blended(
    light_index: u32, 
    light_uniforms: LightDirectionalUniforms,
    world_pos: vec3<f32>, 
    view_space_z: f32,
    frag_coord: vec2<f32>
) -> f32 {
    const BLEND_WIDTH: f32 = 0.3; // 10% blend zone at cascade boundaries
    
    // Convert negative view-space Z to positive depth distance
    let depth = abs(view_space_z);
    let splits = light_uniforms.cascade_splits;
    
    // Determine primary cascade and check for blend zone
    var cascade0: u32;
    var cascade1: u32;
    var blend_factor: f32 = 0.0;
    var in_blend_zone = false;
    
    if depth < splits.y {
        cascade0 = 0u;
        // Check if we're near the boundary with cascade 1
        let range = splits.y - splits.x;
        let blend_start = splits.y - range * BLEND_WIDTH;
        if depth > blend_start {
            cascade1 = 1u;
            blend_factor = smoothstep(blend_start, splits.y, depth);
            in_blend_zone = true;
        }
    } else if depth < splits.z {
        cascade0 = 1u;
        // Check if we're near the boundary with cascade 2
        let range = splits.z - splits.y;
        let blend_start = splits.z - range * BLEND_WIDTH;
        if depth > blend_start {
            cascade1 = 2u;
            blend_factor = smoothstep(blend_start, splits.z, depth);
            in_blend_zone = true;
        }
    } else {
        cascade0 = 2u;
        // Last cascade, no blending needed
    }
    
    // Sample primary cascade
    let shadow_matrix0 = light_uniforms.view_projection_matrices[cascade0];
    let shadow_coords0 = shadow_matrix0 * vec4<f32>(world_pos, 1.0);
    let shadow0 = fetch_light_directional_shadow(light_index, cascade0, shadow_coords0, frag_coord);
    
    // If in blend zone, sample next cascade and blend
    if in_blend_zone {
        let shadow_matrix1 = light_uniforms.view_projection_matrices[cascade1];
        let shadow_coords1 = shadow_matrix1 * vec4<f32>(world_pos, 1.0);
        let shadow1 = fetch_light_directional_shadow(light_index, cascade1, shadow_coords1, frag_coord);
        
        return mix(shadow0, shadow1, blend_factor);
    }
    
    return shadow0;
}

// Fetch spot shadow
fn fetch_light_spot_shadow(light_index: u32, world_pos: vec3<f32>, view_matrix: mat4x4<f32>, homogeneous_coords: vec4<f32>, frag_coord: vec2<f32>) -> f32 {
    // Transform world position to light view space to check if behind the light
    let light_view_pos = view_matrix * vec4<f32>(world_pos, 1.0);

    // In left-handed view space, camera looks down +Z. Points behind the light have Z <= 0
    if light_view_pos.z <= 0.0 {
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

// Helper: Determine which cube face axis is dominant
// Returns 0 for X-dominant, 1 for Y-dominant, 2 for Z-dominant
fn get_dominant_axis(direction: vec3<f32>) -> u32 {
    let abs_dir = abs(direction);
    if (abs_dir.x >= abs_dir.y && abs_dir.x >= abs_dir.z) {
        return 0u; // X-dominant
    } else if (abs_dir.y >= abs_dir.z) {
        return 1u; // Y-dominant
    }
    return 2u; // Z-dominant
}

// Helper: Apply per-face mirror transformation for reflection probes
// Mirrors the direction vector based on which cube face will be sampled
fn apply_reflection_mirror(direction: vec3<f32>) -> vec3<f32> {
    let dominant = get_dominant_axis(direction);
    
    if (dominant == 0u) {
        // X-dominant (±X faces): flip Z axis
        return vec3<f32>(direction.x, direction.y, -direction.z);
    } else if (dominant == 1u) {
        // Y-dominant (±Y faces): flip X axis
        return vec3<f32>(-direction.x, direction.y, direction.z);
    } else {
        // Z-dominant (±Z faces): flip X axis
        return vec3<f32>(-direction.x, direction.y, direction.z);
    }
}

// Diffuse IBL (Image-Based Lighting) - sample environment texture based on normal direction
// This provides omnidirectional ambient lighting tinted by the environment
// Sample at high mip level for blurry/diffuse response (not view-dependent)
fn sample_diffuse_ibl(normal: vec3<f32>, env_id: f32) -> vec3<f32> {
    let env_id_int = u32(env_id);
    
    // Select environment texture based on ID
    if (env_id_int == 1u) {
        // Reflection probe: apply mirror transformation
        let mirrored_normal = apply_reflection_mirror(normal);
        // Sample at middle mip level for diffuse response
        let num_mips = f32(textureNumLevels(environmentTexture1));
        let diffuse_mip = clamp(num_mips * 0.4, 0.0, num_mips - 1.0);
        return textureSampleLevel(environmentTexture1, environmentSampler1, mirrored_normal, diffuse_mip).rgb;
    }
    
    // Default: use global skybox (ID 0) - no mirroring
    // Sample at middle mip level for diffuse response
    let num_mips = f32(textureNumLevels(skyboxTexture));
    let diffuse_mip = clamp(num_mips * 0.4, 0.0, num_mips - 1.0);
    return textureSampleLevel(skyboxTexture, skyboxSampler, normal, diffuse_mip).rgb;
}

// ============================================================================
// Environment Reflection Functions (Specular Component)
// ============================================================================

// Lazanyi & Szirmay-Kalos 2019 - Improved BRDF approximation for rough surfaces
// Provides better energy conservation and physical accuracy for high-roughness materials
// This replaces the need for a pre-computed BRDF LUT texture
fn environment_brdf_lazanyi(NdotV: f32, roughness: f32, F0: vec3<f32>) -> vec3<f32> {
    let r2 = roughness * roughness;
    let r4 = r2 * r2;
    
    // Improved polynomial fits designed for rough dielectrics
    // Scale term: handles Fresnel with proper roughness attenuation
    let scale = F0 + (max(vec3<f32>(1.0 - r2) - F0, vec3<f32>(0.0))) * 
                pow(clamp(1.0 - NdotV, 0.0, 1.0), 5.0) * (1.0 - r4);
    
    // Bias term: minimal correction for rough surfaces
    // Reduced coefficient (1.0 instead of 50.0) to prevent over-brightening dielectrics
    // Primarily benefits metallic surfaces with higher F0 values
    let bias = clamp(F0.g, 0.0, 1.0) * r2 * 0.1;
    
    return scale + bias;
}

// Sample environment map reflection with physically-based BRDF integration
// This handles mirror-like reflections that vary by view angle (unlike diffuse IBL)
// Roughness controls both blur (via mip level) and intensity (via BRDF)
fn sample_environment_reflection(world_pos: vec3<f32>, world_normal: vec3<f32>, roughness: f32, metalness: f32, albedo: vec3<f32>, env_id: f32) -> vec3<f32> {
    let V = normalize(camera_uniforms.position.xyz - world_pos);
    let N = normalize(world_normal);
    let R = reflect(-V, N);
    let NdotV = max(dot(N, V), 0.0);

    // Select environment texture based on ID
    let env_id_int = u32(env_id);
    var env_color: vec3<f32>;
    
    if (env_id_int == 1u) {
        // Reflection probe: apply mirror transformation
        let mirrored_R = apply_reflection_mirror(R);
        // Roughness-based mip selection (rougher = blurrier reflection)
        // Use roughness^2 for perceptually linear blur progression
        let num_mips = f32(textureNumLevels(environmentTexture1));
        let mip = roughness * roughness * (num_mips - 1.0);
        env_color = textureSampleLevel(environmentTexture1, environmentSampler1, mirrored_R, mip).rgb;
    } else {
        // Default: use global skybox (ID 0) - no mirroring
        // Roughness-based mip selection (rougher = blurrier reflection)
        // Use roughness^2 for perceptually linear blur progression
        let num_mips = f32(textureNumLevels(skyboxTexture));
        let mip = roughness * roughness * (num_mips - 1.0);
        env_color = textureSampleLevel(skyboxTexture, skyboxSampler, R, mip).rgb;
    }

    // F0: base reflectivity at normal incidence
    // Dielectrics (plastic, glass) use 0.04, metals use their albedo color
    let dielectric_F0 = vec3<f32>(0.04);
    let F0 = mix(dielectric_F0, albedo, metalness);
    
    // Apply physically-based BRDF approximation (accounts for roughness and fresnel)
    let brdf = environment_brdf_lazanyi(NdotV, roughness, F0);
    
    // Additional roughness-based attenuation to further reduce reflections on very rough surfaces
    // Rough surfaces scatter light in many directions, reducing mirror-like reflections
    let roughness_attenuation = 1.0 - (roughness * roughness * roughness);
    
    // Final reflection: environment color modulated by BRDF and roughness
    // The Lazanyi approximation includes:
    // - Fresnel (view angle dependent reflectivity)
    // - Roughness attenuation (rough surfaces have much dimmer reflections)
    // - Metalness (via F0 affecting the BRDF curve)
    return env_color * brdf * roughness_attenuation;
}

// ============================================================================
// GGX Specular BRDF Functions for Direct Lights
// ============================================================================

// GGX Normal Distribution Function - controls specular highlight sharpness
// Higher roughness = broader, softer highlights
fn distribution_ggx(NdotH: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH2 = NdotH * NdotH;
    let denom = (NdotH2 * (a2 - 1.0) + 1.0);
    let denom2 = denom * denom;
    
    // Epsilon protection prevents division by zero when NdotH ≈ 1.0 and roughness ≈ 0.0
    let epsilon = 0.0001;
    return a2 / (3.14159265359 * max(denom2, epsilon));
}

// Schlick-GGX Geometry function - prevents light leaking at grazing angles
fn geometry_schlick_ggx(NdotV: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    let denom = NdotV * (1.0 - k) + k;
    
    // Epsilon protection prevents division by near-zero
    let epsilon = 0.0001;
    return NdotV / max(denom, epsilon);
}

// Smith's method combines view and light geometry occlusion
fn geometry_smith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
    let ggx1 = geometry_schlick_ggx(NdotV, roughness);
    let ggx2 = geometry_schlick_ggx(NdotL, roughness);
    return ggx1 * ggx2;
}

// Fresnel-Schlick - reflectivity increases at grazing angles (car paint effect!)
fn fresnel_schlick(cosTheta: f32, F0: vec3<f32>) -> vec3<f32> {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample G-Buffer
    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_sample = textureSample(gbuffer_normal, sampler_linear, in.uv_coords);
    let metal_rough = textureSample(gbuffer_metallic_roughness, sampler_linear, in.uv_coords);
    let metalness = metal_rough.r;
    // Clamp roughness to prevent mathematical instability in GGX functions
    // Minimum 0.045 is reasonable (even polished chrome has some roughness)
    let roughness = max(metal_rough.g, 0.045);
    let environment_id = metal_rough.a; // Read environment texture ID from alpha channel
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
    // This provides ambient lighting tinted by the environment, based on surface normal
    // IBL intensity of 1.0 = full tinting by skybox color in normal direction
    let diffuse_ibl_color = sample_diffuse_ibl(world_normal, environment_id) * scene_uniforms.ibl_intensity;
    let ambient = scene_uniforms.ambient_light_color.rgb + diffuse_ibl_color;

    // Metals have no diffuse response; dielectrics lose energy to specular via fresnel
    let diffuse_albedo = albedo * (1.0 - metalness);
    var color = diffuse_albedo * ambient;

    // Environment reflections (mirror-like, view-dependent, separate from IBL)
    // These are always active and use physically-based BRDF (not affected by ibl_intensity)
    let env_reflection = sample_environment_reflection(world_pos, world_normal, roughness, metalness, albedo, environment_id);

    // Pre-calculate vectors needed for specular lighting
    let V = normalize(camera_uniforms.position.xyz - world_pos);
    let NdotV = max(dot(world_normal, V), 0.0);
    
    // F0: Base reflectivity at normal incidence
    // Dielectrics (plastic, glass) use ~0.04, metals use their albedo color
    let F0 = mix(vec3<f32>(0.04), albedo, metalness);

    for (var i: u32 = 0u; i < light_directional_uniforms.light_count; i++) {
        let light_uniforms = light_directional_uniforms.lights[i];

        if light_uniforms.color.a > 0.0 {
            // Light direction points where light is facing (light → scene)
            // For lighting, we need direction TO light (scene → light), so negate
            let light_dir = normalize(-light_uniforms.direction.xyz);
            let H = normalize(V + light_dir);  // Halfway vector for specular
            
            let NdotL = max(dot(world_normal, light_dir), 0.0);
            let NdotH = max(dot(world_normal, H), 0.0);
            let HdotV = max(dot(H, V), 0.0);

            // Directional light with cascade shadow and blending
            let view_space_z = view_pos.z;
            let shadow = fetch_light_directional_shadow_blended(i, light_uniforms, world_pos, view_space_z, in.position.xy);

            // Diffuse contribution
            color += diffuse_albedo * light_uniforms.color.rgb * light_uniforms.color.a * shadow * NdotL;
            
            // Specular contribution (Cook-Torrance GGX BRDF)
            if (NdotL > 0.0) {
                // Cook-Torrance BRDF: D * G * F / (4 * NdotV * NdotL)
                let D = distribution_ggx(NdotH, roughness);
                let G = geometry_smith(NdotV, NdotL, roughness);
                let F = fresnel_schlick(HdotV, F0);
                
                let numerator = D * G * F;
                let denominator = max(4.0 * NdotV * NdotL, 0.001);
                let specular_brdf = numerator / denominator;
                
                // Add specular highlight
                color += specular_brdf * light_uniforms.color.rgb * light_uniforms.color.a * shadow * NdotL;
            }
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

            // Calculate light direction (fragment → light)
            let light_dir = normalize(light_spot.position.xyz - world_pos);
            let H = normalize(V + light_dir);  // Halfway vector for specular

            // Light forward direction (should already be light → forward)
            let forward = normalize(light_spot.forward.xyz);
            let penumbra_percent = light_spot.fov_penumbra.y;

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

            // Apply penumbra with smooth falloff
            let spot_factor = smoothstep(1.0, 1.0 - penumbra_percent, normalized_dist);

            // Distance-based falloff using spotlight's frustum
            // shadow_coords.w contains perspective-correct depth where w ≈ -view_z
            // This gives us the linear distance from the spotlight
            let light_distance = shadow_coords.w;
            let spot_far = light_spot.near_far.y;
            let normalized_dist_from_light = clamp(light_distance / spot_far, 0.0, 1.0);
            let dist_falloff = (1.0 - normalized_dist_from_light) / (1.0 + normalized_dist_from_light * normalized_dist_from_light);

            // Lighting angles
            let NdotL = max(dot(world_normal, light_dir), 0.0);
            let NdotH = max(dot(world_normal, H), 0.0);
            let HdotV = max(dot(H, V), 0.0);

            // Combined attenuation
            let attenuation = shadow * spot_factor * dist_falloff;

            // Diffuse contribution
            color += diffuse_albedo * light_spot.color_intensity.rgb * light_spot.color_intensity.a * NdotL * attenuation;
            
            // Specular contribution (Cook-Torrance GGX BRDF)
            if (NdotL > 0.0) {
                let D = distribution_ggx(NdotH, roughness);
                let G = geometry_smith(NdotV, NdotL, roughness);
                let F = fresnel_schlick(HdotV, F0);
                
                let numerator = D * G * F;
                let denominator = max(4.0 * NdotV * NdotL, 0.001);
                let specular_brdf = numerator / denominator;
                
                // Add specular highlight
                color += specular_brdf * light_spot.color_intensity.rgb * light_spot.color_intensity.a * NdotL * attenuation;
            }
        }
    }

    // Add environment reflections and emissive (unaffected by shadow/lights)
    color += env_reflection;
    color += emissive;

    // Fog: https://iquilezles.org/articles/fog/
    // Distance from camera to fragment
    let dist = length(view_pos);

    // View direction (camera → point in world space)
    let view_dir = normalize(world_pos - camera_uniforms.position.xyz);

    // Sun direction (use first directional light)
    // For fog sun glow, we need direction TOWARD the sun (opposite of where light points)
    // light.direction points where light faces (down), we want direction to sun (up), so negate
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
    return output;
}
