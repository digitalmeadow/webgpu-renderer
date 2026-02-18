struct Scene {
    @builtin(frag_depth) depth: f32,
    @location(0) normal: vec4<f32>,
    @location(1) albedo: vec4<f32>,
    @location(2) motion: vec4<f32>,
};

@group(0) @binding(0) var<uniform> model: mat4x4<f32>;

struct Camera {
    view_projection_matrix: mat4x4<f32>,
};
@group(1) @binding(0) var<uniform> camera: Camera;

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

@group(2) @binding(0) var base_color_texture: texture_2d<f32>;
@group(2) @binding(1) var base_color_sampler: sampler;

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
@group(3) @binding(0) var<uniform> light_uniforms: LightUniforms;

struct SceneUniforms {
  ambient_light_color: vec4<f32>,
}
@group(4) @binding(0) var<uniform> scene_uniforms: SceneUniforms;


@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let albedo = textureSample(base_color_texture, base_color_sampler, in.uv);
    var color = albedo.rgb * scene_uniforms.ambient_light_color.rgb;

    // Directional light
    let N = normalize(in.normal);
    let L = normalize(light_uniforms.lights[0].direction.xyz);
    let diffuse = max(dot(N, L), 0.0);
    color += albedo.rgb * light_uniforms.lights[0].color.rgb * light_uniforms.lights[0].intensity * diffuse;
    
    return vec4<f32>(color, albedo.a);
}
