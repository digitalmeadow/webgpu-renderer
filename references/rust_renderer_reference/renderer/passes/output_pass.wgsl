struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Procedurally generate the triangle's vertices
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0), // Bottom-left
        vec2<f32>(3.0, -1.0),  // Bottom-right (extends beyond the screen)
        vec2<f32>(-1.0, 3.0),  // Top-left (extends beyond the screen)
    );

    // Map vertex positions to texture coordinates
    var uv_coords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0), // Bottom-left
        vec2<f32>(2.0, 1.0), // Bottom-right (extends beyond the screen)
        vec2<f32>(0.0, -1.0), // Top-left (extends beyond the screen)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = uv_coords[vertex_index];
    return output;
}

@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var input_color_texture: texture_2d<f32>;
@group(0) @binding(2) var text_pass_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let input_color = textureSample(input_color_texture, sampler_linear, in.uv_coords);
    let text_pass = textureSample(text_pass_texture, sampler_linear, in.uv_coords);

    // Alpha blend text pass over standard pass
    let color_rgb = mix(input_color.rgb, text_pass.rgb, text_pass.a);
    let color_a = input_color.a + text_pass.a * (1.0 - input_color.a);

    return vec4<f32>(color_rgb, color_a);
}