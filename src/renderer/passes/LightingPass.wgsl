struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

// G-Buffer textures and samplers from geometry buffer (group 0)
@group(0) @binding(0) var gbuffer_albedo: texture_2d<f32>;
@group(0) @binding(1) var gbuffer_normal_roughness: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_metal_roughness: texture_2d<f32>;
@group(0) @binding(3) var gbuffer_depth: texture_depth_2d;
@group(0) @binding(4) var sampler_linear: sampler;
@group(0) @binding(5) var sampler_nearest: sampler;
@group(0) @binding(6) var shadow_sampler: sampler_comparison;

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_matrix: u32,
}

@group(2) @binding(0) var<uniform> light_directionals: array<LightDirectionalUniforms, 2>;
@group(2) @binding(1) var light_directional_shadow_texture_array: texture_depth_2d_array;

struct SceneUniforms {
    ambient_light_color: vec4<f32>,
}

@group(2) @binding(2) var<uniform> scene_uniforms: SceneUniforms;

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

    var uv_coords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0),
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = uv_coords[vertex_index];
    
    return output;
}

fn position_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc_x = uv.x * 2.0 - 1.0;
    let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
    let ndc_z = depth;
    
    let clip_pos = vec4<f32>(ndc_x, ndc_y, ndc_z, 1.0);
    let view_pos = camera_uniforms.projection_matrix_inverse * clip_pos;
    
    return view_pos.xyz / view_pos.w;
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
        light_directional_shadow_texture_array, shadow_sampler, uv_clamped, i32(cascade_id), depth
    );
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_roughness = textureSample(gbuffer_normal_roughness, sampler_linear, in.uv_coords);
    let normal = normal_roughness.rgb;
    let roughness = normal_roughness.a;
    let depth = textureLoad(gbuffer_depth, vec2<i32>(in.uv_coords * vec2<f32>(textureDimensions(gbuffer_depth))), 0);

    let isBackground = depth >= 1.0;

    let view_pos = position_from_depth(in.uv_coords, depth);
    let world_pos = (camera_uniforms.view_matrix_inverse * vec4<f32>(view_pos, 1.0)).xyz;
    let world_normal = normalize((camera_uniforms.view_matrix_inverse * vec4<f32>(normal, 0.0)).xyz);

    let light = light_directionals[0u];
    
    let view_space_z = -view_pos.z;
    let cascade_index = select_cascade(view_space_z, light.cascade_splits);
    
    let shadow_matrix = light.view_projection_matrices[cascade_index];
    let shadow_coords = shadow_matrix * vec4<f32>(world_pos, 1.0);
    
    let shadow_layer = 0u * 3u + cascade_index;
    let shadow = fetch_light_directional_shadow(shadow_layer, shadow_coords);

    let N = normalize(world_normal);
    let L = normalize(-light.direction.xyz);
    let diffuse = max(dot(N, L), 0.0);
    
    let ambient = scene_uniforms.ambient_light_color.rgb;
    let light_color = light.color.rgb;
    let light_intensity = light.color.a;
    
    var color = albedo * ambient;
    let shadow_value = select(shadow, 1.0, isBackground);
    color += albedo * light_color * light_intensity * diffuse * shadow_value;

    output.color = vec4<f32>(color, 1.0);
    return output;
}
