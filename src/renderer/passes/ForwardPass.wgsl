// Forward Pass Shader for transparent objects
// Renders transparent meshes with scene lighting and shadows

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
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

// Global Bind Group (Group 2): Scene + Light combined
// Scene uniforms
struct SceneUniforms {
    ambient_light_color: vec4<f32>,
    ibl_intensity: f32,
    _pad1: vec3<f32>,
    fog_color_base: vec4<f32>,
    fog_color_sun: vec4<f32>,
    fog_extinction: vec4<f32>,
    fog_inscattering: vec4<f32>,
    fog_sun_exponent: f32,
    fog_enabled: u32,
    _pad2: vec2<f32>,
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

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = mesh_uniforms.model_matrix * vec4<f32>(in.position, 1.0);
    out.position = camera_uniforms.view_projection_matrix * world_pos;
    out.world_position = world_pos.xyz;
    out.world_normal = (mesh_uniforms.model_matrix * vec4<f32>(in.normal, 0.0)).xyz;
    out.uv_coords = in.uv;
    return out;
}

// Helper: Select cascade based on view-space depth
fn select_cascade(view_space_z: f32, splits: vec4<f32>) -> u32 {
    if view_space_z < splits.y {
        return 0u;
    } else if view_space_z < splits.z {
        return 1u;
    } else {
        return 2u;
    }
}

// Fetch directional shadow
fn fetch_light_directional_shadow(light_index: u32, cascade_id: u32, homogeneous_coords: vec4<f32>) -> f32 {
    if homogeneous_coords.w <= 0.0 {
        return 1.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let uv = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    let layer_index = light_index * 3u + cascade_id;

    return textureSampleCompareLevel(
        light_directional_shadow_texture, sampler_compare, uv, i32(layer_index), depth
    );
}

// Fetch spot shadow
fn fetch_light_spot_shadow(light_index: u32, world_pos: vec3<f32>, view_matrix: mat4x4<f32>, homogeneous_coords: vec4<f32>) -> f32 {
    let light_view_pos = view_matrix * vec4<f32>(world_pos, 1.0);

    if light_view_pos.z >= 0.0 {
        return 0.0;
    }

    if homogeneous_coords.w <= 0.0 {
        return 0.0;
    }

    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let uv = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;

    if uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || depth < 0.0 || depth > 1.0 {
        return 0.0;
    }

    return textureSampleCompareLevel(
        light_spot_shadow_texture, sampler_compare, uv, i32(light_index), depth
    );
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    let albedo_tex = textureSample(albedo_texture, material_sampler, in.uv_coords);

    let albedo = vec4<f32>(albedo_tex.rgb * material_uniforms.color.rgb, albedo_tex.a);
    let world_normal = normalize(in.world_normal);

    var color = albedo.rgb * max(scene_uniforms.ambient_light_color.rgb, vec3<f32>(0.15));

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

            let shadow = fetch_light_directional_shadow(i, cascade, shadow_coords);
            let effective_shadow = mix(1.0, shadow, material_uniforms.opacity);

            color += albedo.rgb * light_uniforms.color.rgb * light_uniforms.color.a * effective_shadow * diffuse;
        }
    }

    // Spot lights
    for (var j: u32 = 0u; j < light_spot_uniforms.light_count; j++) {
        let light_spot = light_spot_uniforms.lights[j];

        if light_spot.color_intensity.a > 0.0 {
            let shadow_coords = light_spot.view_projection_matrix * vec4<f32>(in.world_position, 1.0);

            let light_to_frag = in.world_position - light_spot.position.xyz;
            let light_dir = normalize(light_to_frag);

            let forward = normalize(light_spot.forward.xyz);
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

            let diffuse = max(0.0, dot(world_normal, light_dir));

            let shadow = fetch_light_spot_shadow(j, in.world_position, light_spot.view_matrix, shadow_coords);

            color += albedo.rgb * light_spot.color_intensity.rgb * light_spot.color_intensity.a * shadow * diffuse * spot_factor;
        }
    }

    output.color = vec4<f32>(color, albedo.a * material_uniforms.opacity);

    return output;
}
