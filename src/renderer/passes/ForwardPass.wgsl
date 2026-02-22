struct MaterialUniforms {
  opacity: f32,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
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

struct SceneUniforms {
    ambient_light_color: vec4<f32>,
}

struct Light {
    color: vec4<f32>,
    direction: vec4<f32>,
    intensity: f32,
    light_type: u32,
    _padding: vec2<f32>,
}

struct LightUniforms {
    lights: array<Light, 1>,
}

@group(2) @binding(0) var base_color_texture: texture_2d<f32>;
@group(2) @binding(1) var normal_texture: texture_2d<f32>;
@group(2) @binding(2) var metalness_roughness_texture: texture_2d<f32>;
@group(2) @binding(3) var depth_texture: texture_depth_2d;
@group(2) @binding(4) var sampler_linear: sampler;
@group(2) @binding(5) var sampler_nearest: sampler;
@group(2) @binding(6) var sampler_compare: sampler_comparison;
@group(2) @binding(7) var<uniform> material: MaterialUniforms;

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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base_color = textureSample(base_color_texture, sampler_linear, in.uv);
    let normal = normalize(in.normal);
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.0));
    let diffuse = max(dot(normal, light_dir), 0.0);
    let ambient = vec3<f32>(0.1, 0.1, 0.1);
    
    var final_color = base_color * (diffuse + ambient);
    final_color.a = material.opacity;
    return final_color;
}
