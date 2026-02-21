struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

struct LightUniforms {
    lightViewProjMatrix: mat4x4<f32>,
    lightPos: vec4<f32>,
    direction: vec4<f32>,
    color_intensity: vec4<f32>,
}

@group(0) @binding(0) var<uniform> light_uniforms: LightUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    let model_position = mesh_uniforms.model_transform_matrix * vec4<f32>(in.position.xyz, 1.0);
    let clip_position = light_uniforms.lightViewProjMatrix * model_position;
    output.position = clip_position;
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @builtin(frag_depth) f32 {
    // Keep clip-space Z [-1, 1] - GPU automatically handles this for frag_depth
    return in.position.z;
}
