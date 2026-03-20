const MAX_JOINTS: u32 = 64u;

struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
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
};

@group(0) @binding(0) var<uniform> light_directional_uniforms: LightDirectionalUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, MAX_JOINTS>,
    apply_skinning: u32,
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );
    
    let skinned_position = skin_matrix * in.position;
    let final_position = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));
    
    let model_position = mesh_uniforms.model_transform_matrix * final_position;
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_index] * model_position;
    output.position = clip_position;
    
    return output;
}
