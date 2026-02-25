struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) debug_model_pos: vec3<f32>,
    @location(2) debug_clip_pos: vec4<f32>,
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
    
    // Use uniform matrices from light
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_matrix] * model_position;
    
    output.position = clip_position;
    output.world_position = model_position.xyz;
    output.debug_model_pos = model_position.xyz;
    output.debug_clip_pos = clip_position;

    return output;
}

// DEBUG: Output various debug values
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // DEBUG: Show clip coordinates as color to diagnose NDC issues
    // X: should be -1 to 1
    // Y: should be -1 to 1  
    // Z: should be 0 to 1 (WebGPU)
    let color = vec4<f32>(
        (in.debug_clip_pos.x + 1.0) * 0.5,  // Map -1..1 to 0..1
        (in.debug_clip_pos.y + 1.0) * 0.5,  // Map -1..1 to 0..1
        clamp(in.debug_clip_pos.z, 0.0, 1.0), // Clamp to valid range
        1.0
    );
    
    return vec4<f32>(color.rgb, 1.0);
}
