struct MaterialUniforms {
  opacity: f32,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
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
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = camera.view_projection_matrix * model * vec4<f32>(in.position, 1.0);
    out.normal = (model * vec4<f32>(in.normal, 0.0)).xyz;
    out.uv = in.uv;
    return out;
}

@group(3) @binding(1) var base_color_texture: texture_2d<f32>;
@group(3) @binding(0) var base_color_sampler: sampler;
@group(3) @binding(4) var<uniform> material: MaterialUniforms;

struct Light {
    color: vec4<f32>,
    direction: vec4<f32>,
    intensity: f32,
    light_type: u32, // 0: Directional, 1: Point, 2: Spot
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


@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base_color = textureSample(base_color_texture, base_color_sampler, in.uv);
    let light = light_uniforms.lights[0];
    let light_dir = normalize(light.direction.xyz);
    let normal = normalize(in.normal);
    let diffuse = max(dot(normal, light_dir), 0.0) * light.intensity;
    let ambient = scene_uniforms.ambient_light_color;
    var final_color = base_color * (diffuse + ambient);
    final_color.a = material.opacity;
    return final_color;
}
