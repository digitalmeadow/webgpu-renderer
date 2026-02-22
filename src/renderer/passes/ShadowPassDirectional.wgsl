struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
};

struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0) var<uniform> context_uniforms: ContextUniforms;

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_matrix: u32,
}

@group(1) @binding(0) var<uniform> light_directional_uniforms: LightDirectionalUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

@group(2) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * vec4<f32>(in.position.xyz, 1.0);
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_matrix] * model_position;
    output.position = clip_position;
    output.world_position = model_position.xyz;
    
    return output;
}

// DEBUG: Output world position as color AND write depth
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Visualize world position as RGB
    let pos = in.world_position + vec3<f32>(50.0, 50.0, 50.0);
    let color = pos / 100.0;
    return vec4<f32>(color, 1.0);
}
