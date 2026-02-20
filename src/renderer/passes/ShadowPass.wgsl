struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_index: u32,
}

@group(0) @binding(0) var<uniform> light_directional_uniforms: LightDirectionalUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let model_position = mesh_uniforms.model_transform_matrix * vec4<f32>(in.position.xyz, 1.0);
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_index] * model_position;
    output.position = clip_position;
    
    return output;
}
