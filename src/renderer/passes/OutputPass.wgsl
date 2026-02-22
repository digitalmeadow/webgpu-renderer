// Output Pass Shader
// Simply renders the lit texture to the screen

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var input_texture: texture_2d<f32>;

// Debug: depth texture binding (no sampler needed)
@group(0) @binding(0) var debug_depth_texture: texture_depth_2d;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = positions[vertex_index] * 0.5 + 0.5;
    output.uv_coords.y = 1.0 - output.uv_coords.y;
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(input_texture, sampler_linear, in.uv_coords);
}

// Debug: render depth texture as grayscale color
@fragment
fn fs_main_debug_depth(in: VertexOutput) -> @location(0) vec4<f32> {
    let depth = textureLoad(debug_depth_texture, vec2<i32>(in.uv_coords * vec2<f32>(textureDimensions(debug_depth_texture))), 0);
    // Depth is 1.0 when far, 0.0 when close - invert for visualization
    // (0 = black/far in shadow map convention, 1 = white/close)
    let visual = 1.0 - depth;
    return vec4<f32>(visual, visual, visual, 1.0);
}
