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

@group(0) @binding(0) var standard_pass_sampler: sampler;
@group(0) @binding(1) var standard_pass_texture: texture_2d<f32>;

struct BloomParams {
    direction: vec2<f32>,
    radius : f32,
    alpha : f32
}

var<private> offsets : array<f32, 3> = array<f32, 3>(0.0, 1.384615421, 3.230769157);
var<private> weights : array<f32, 3> = array<f32, 3>(0.227027029, 0.31621623, 0.07027027);

fn getGaussianBlur(texture: texture_2d<f32>, texture_sampler: sampler, tex_coord: vec2<f32>, direction: vec2<f32>) -> vec4<f32> {
    let radius = 8.0;
    let texel_radius = (vec2(radius) / vec2<f32>(textureDimensions(texture)));
    let step = (direction * texel_radius);
    var sum = vec4(0.0);
    sum = sum + (textureSample(texture, texture_sampler, tex_coord) * weights[0]);
    sum = sum + (textureSample(texture, texture_sampler, tex_coord + (step * 1.0)) * weights[1]);
    sum = sum + (textureSample(texture, texture_sampler, tex_coord - (step * 1.0)) * weights[1]);
    sum = sum + (textureSample(texture, texture_sampler, tex_coord + (step * 2.0)) * weights[2]);
    sum = sum + (textureSample(texture, texture_sampler, tex_coord - (step * 2.0)) * weights[2]);
    return vec4(sum.rgb, 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let original_color = textureSample(standard_pass_texture, standard_pass_sampler,  in.uv_coords);

    let blur_color_x = getGaussianBlur(standard_pass_texture, standard_pass_sampler, in.uv_coords, vec2<f32>(1.0, 0.0));
    let blur_color_y = getGaussianBlur(standard_pass_texture, standard_pass_sampler, in.uv_coords, vec2<f32>(0.0, 1.0));
    let blur_color = mix(blur_color_x, blur_color_y, 0.5);

    let center = 0.5;
    let width = 0.3; // controls how wide the sharp band is
    let blur_strength = smoothstep(0.0, 1.0, abs(in.uv_coords.y - center) / width);

    let output_color = mix(original_color, blur_color, blur_strength);

    return output_color;
}