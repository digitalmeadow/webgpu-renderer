struct MaterialUniforms {
  opacity: f32,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near_far: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: mat4x4<f32>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) world_position: vec3<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let world_pos = model * vec4<f32>(in.position, 1.0);
    out.position = camera.view_projection_matrix * world_pos;
    out.normal = (model * vec4<f32>(in.normal, 0.0)).xyz;
    out.uv = in.uv;
    out.world_position = world_pos.xyz;
    return out;
}

@group(3) @binding(1) var base_color_texture: texture_2d<f32>;
@group(3) @binding(0) var base_color_sampler: sampler;
@group(3) @binding(4) var<uniform> material: MaterialUniforms;

struct Light {
    color: vec4<f32>,
    direction: vec4<f32>,
    intensity: f32,
    light_type: u32,
    _padding: vec2<f32>,
};

struct LightUniforms {
    lights: array<Light, 1>,
};

struct SceneUniforms {
  ambient_light_color: vec4<f32>,
}

// Global Bind Group (Group 2): Scene + Light
@group(2) @binding(0) var<uniform> scene_uniforms: SceneUniforms;
@group(2) @binding(1) var<uniform> light_uniforms: LightUniforms;

// Shadow (Group 4)
@group(4) @binding(0) var sampler_compare: sampler_comparison;
@group(4) @binding(1) var<uniform> light_directional_shadow: LightDirectionalShadow;
@group(4) @binding(2) var shadow_texture: texture_depth_2d_array;

struct LightDirectionalShadow {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_index: u32,
}

fn fetch_shadow(homogeneous_coords: vec4<f32>, cascade_id: i32) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let light_local = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    let eps = 1e-5;
    let uv_clamped = clamp(light_local, vec2<f32>(eps, eps), vec2<f32>(1.0 - eps, 1.0 - eps));
    
    return textureSampleCompareLevel(shadow_texture, sampler_compare, uv_clamped, cascade_id, depth);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base_color = textureSample(base_color_texture, base_color_sampler, in.uv);
    let light = light_uniforms.lights[0];
    let light_dir = normalize(light.direction.xyz);
    let normal = normalize(in.normal);
    let diffuse = max(dot(normal, light_dir), 0.0) * light.intensity;
    
    // Shadow calculation
    var shadow = 1.0;
    if (light.light_type == 0u) {
        let shadow_matrix = light_directional_shadow.view_projection_matrices[0];
        let shadow_coords = shadow_matrix * vec4<f32>(in.world_position, 1.0);
        shadow = fetch_shadow(shadow_coords, 0);
    }
    
    let ambient = scene_uniforms.ambient_light_color;
    var final_color = base_color * ((diffuse * shadow) + ambient);
    final_color.a = material.opacity;
    return final_color;
}
