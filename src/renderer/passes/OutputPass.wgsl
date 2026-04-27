struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@group(0) @binding(0) var output_sampler: sampler;
@group(0) @binding(1) var input_texture: texture_2d<f32>;

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
    let linear = textureSample(input_texture, output_sampler, in.uv_coords).rgb;

    // sRGB gamma encoding
    let cutoff = vec3<f32>(0.0031308);
    let low = linear * 12.92;
    let high = 1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055;
    let srgb = select(high, low, linear < cutoff);

    return vec4<f32>(srgb, 1.0);
}
