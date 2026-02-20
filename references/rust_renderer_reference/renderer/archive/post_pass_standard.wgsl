struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Programatically generate the triangle's vertices
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

@group(0) @binding(0) var standard_pass_sampler: sampler;
@group(0) @binding(1) var standard_pass_texture: texture_2d<f32>;

struct BloomParams {
    direction: vec2<f32>,
    radius : f32,
    alpha : f32
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let original_color = textureSample(standard_pass_texture, standard_pass_sampler,  in.uv_coords);

    let output_color = original_color;

    return output_color;
}