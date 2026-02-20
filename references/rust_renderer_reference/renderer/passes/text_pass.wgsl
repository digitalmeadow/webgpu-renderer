struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv_coords: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

// Uniforms
// Context uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0) var<uniform> context_uniforms: ContextUniforms;

// MeshText uniforms
struct MeshTextUniforms {
    state: u32
}

@group(1) @binding(0) var<uniform> mesh_text_uniforms: MeshTextUniforms;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // Convert from pixel coordinates to NDC (0,0 = top-left to 0,0 = center)
    let flipped_position = vec2<f32>(
        in.position.x,
        context_uniforms.screen_size.y - in.position.y
    );
    let pos_ndc = (flipped_position / context_uniforms.screen_size) * 2.0 - vec2<f32>(1.0, 1.0);

    let aspect = context_uniforms.screen_size.x / context_uniforms.screen_size.y;

    out.position = vec4<f32>(pos_ndc.x, pos_ndc.y, 0.0, 1.0);
    out.uv_coords = in.uv_coords;
    return out;
}

@group(1) @binding(1) var font_sampler: sampler;
@group(1) @binding(2) var font_texture: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let msdf = textureSample(font_texture, font_sampler, in.uv_coords).rgb;
    // Median of R, G, B channels (MSDF decode)
    let sd = median(msdf.r, msdf.g, msdf.b);
    // Smoothing factor (tune for your font atlas)
    let smoothing = 0.1;
    let alpha = smoothstep(0.5 - smoothing, 0.5 + smoothing, sd);

    // States
    let is_hovered =  f32(mesh_text_uniforms.state & 0xFF);

    return vec4<f32>(is_hovered, 1.0, 1.0, alpha);
}

// Helper function for median
fn median(r: f32, g: f32, b: f32) -> f32 {
    return max(min(r, g), min(max(r, g), b));
}