struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0) var<uniform> context_uniforms: ContextUniforms;

struct LightSpotUniforms {
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    angle_inner: f32,
    angle_outer: f32,
}

@group(1) @binding(0) var<uniform> light_spot_uniforms: LightSpotUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

@group(2) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * vec4<f32>(in.position.xyz, 1.0);
    let clip_position = light_spot_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;
    
    return output;
}
