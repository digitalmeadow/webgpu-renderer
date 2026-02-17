// Output Pass Shader
// Renders the G-Buffer to the screen

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@group(0) @binding(0) var gbuffer_position: texture_2d<f32>;
@group(0) @binding(1) var gbuffer_normal: texture_2d<f32>;
@group(0) @binding(2) var sampler_linear: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    
    // Derive UV from position (NDC -> UV)
    // -1 -> 0, 1 -> 1
    output.uv_coords = positions[vertex_index] * 0.5 + 0.5;
    // Flip Y because WebGPU texture Y is top-down
    output.uv_coords.y = 1.0 - output.uv_coords.y;
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dimensions = vec2<f32>(textureDimensions(gbuffer_normal));
    let uv = vec2<i32>(clamp(in.uv_coords, vec2<f32>(0.0), vec2<f32>(1.0)) * dimensions);
    let normal = textureLoad(gbuffer_normal, uv, 0);
    
    let color = normal.rgb * 0.5 + 0.5;
    // let color = vec3(1.0, 0.0, 0.0); // Red for testing

    return vec4<f32>(color, 1.0);
}
