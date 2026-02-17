struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var uv_coords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0),
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = uv_coords[vertex_index];
    return output;
}

struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> context_uniforms: ContextUniforms;

// Camera uniforms
struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}


@group(1) @binding(0)
var<uniform> camera_uniforms: CameraUniforms;

@group(2) @binding(0) var standard_pass_sampler: sampler;
@group(2) @binding(1) var standard_pass_texture: texture_2d<f32>;
@group(2) @binding(2) var position_sampler: sampler;
@group(2) @binding(3) var standard_pass_position_texture: texture_2d<f32>;
@group(2) @binding(4) var standard_pass_normal_texture: texture_2d<f32>;

// SSAO kernel (for demo, hardcoded; for production, upload as uniform)
const SSAO_KERNEL_SIZE: u32 = 32;
const ssao_kernel: array<vec3<f32>, SSAO_KERNEL_SIZE> = array<vec3<f32>, SSAO_KERNEL_SIZE>(
    vec3<f32>(0.186, 0.000, 0.982),
    vec3<f32>(0.553, 0.553, 0.623),
    vec3<f32>(-0.553, 0.553, 0.623),
    vec3<f32>(0.553, -0.553, 0.623),
    vec3<f32>(-0.553, -0.553, 0.623),
    vec3<f32>(0.707, 0.000, 0.707),
    vec3<f32>(0.000, 0.707, 0.707),
    vec3<f32>(-0.707, 0.000, 0.707),
    vec3<f32>(0.000, -0.707, 0.707),
    vec3<f32>(0.923, 0.382, 0.000),
    vec3<f32>(-0.923, 0.382, 0.000),
    vec3<f32>(0.923, -0.382, 0.000),
    vec3<f32>(-0.923, -0.382, 0.000),
    vec3<f32>(0.382, 0.923, 0.000),
    vec3<f32>(-0.382, 0.923, 0.000),
    vec3<f32>(0.382, -0.923, 0.000),
    vec3<f32>(-0.382, -0.923, 0.000),
    vec3<f32>(0.000, 0.000, 1.000),
    vec3<f32>(0.309, 0.951, 0.000),
    vec3<f32>(-0.309, 0.951, 0.000),
    vec3<f32>(0.309, -0.951, 0.000),
    vec3<f32>(-0.309, -0.951, 0.000),
    vec3<f32>(0.951, 0.309, 0.000),
    vec3<f32>(-0.951, 0.309, 0.000),
    vec3<f32>(0.951, -0.309, 0.000),
    vec3<f32>(-0.951, -0.309, 0.000),
    vec3<f32>(0.000, 0.000, 0.5),
    vec3<f32>(0.000, 0.000, 0.8),
    vec3<f32>(0.000, 0.000, 0.3),
    vec3<f32>(0.000, 0.000, 0.7),
    vec3<f32>(0.000, 0.000, 0.2),
    vec3<f32>(0.000, 0.000, 0.9)
);

fn get_tangent_basis(normal: vec3<f32>) -> mat3x3<f32> {
    let up = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.y) > 0.99);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);
    return mat3x3<f32>(tangent, bitangent, normal);
}

// Project a view-space position to screen UV using the camera's projection matrix
fn view_to_uv(view_pos: vec3<f32>, proj: mat4x4<f32>) -> vec2<f32> {
    let clip = proj * vec4<f32>(view_pos, 1.0);
    let ndc = clip.xyz / clip.w;
    // Flip Y axis for texture coordinates
    return vec2<f32>(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let position: vec3<f32> = textureSample(standard_pass_position_texture, position_sampler, in.uv_coords).xyz;
    let normal: vec3<f32> = normalize(textureSample(standard_pass_normal_texture, standard_pass_sampler, in.uv_coords).xyz);

    let radius: f32 = 0.3;
    let bias = 0.3;
    var occlusion: f32 = 0.0;

    let proj = camera_uniforms.projection_matrix;
    let basis = get_tangent_basis(normal);

    for (var i = 0u; i < SSAO_KERNEL_SIZE; i = i + 1u) {
        let sample_vec = basis * ssao_kernel[i];
        let sample_pos = position + sample_vec * radius;

        // Project sample_pos to screen UV
        let sample_uv = clamp(view_to_uv(sample_pos, proj), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
        let sample_position = textureSample(standard_pass_position_texture, position_sampler, sample_uv).xyz;

        let range_check = smoothstep(0.0, 1.0, radius / abs(position.z - sample_position.z));
        if (sample_position.z >= sample_pos.z + bias) {
            occlusion += range_check;
        }
    }

    occlusion = 1.0 - (occlusion / f32(SSAO_KERNEL_SIZE));

    var color = textureSample(standard_pass_texture, standard_pass_sampler, in.uv_coords);
    color *= occlusion;
    return color;

    // return vec4<f32>(vec3<f32>(occlusion), 1.0);

    // return vec4(view_to_uv(position, proj).x, view_to_uv(position, proj).y, 1.0, 1.0);
    // return vec4(position, 1.0);
    // return vec4(normal, 1.0);
    // let sample_uv = clamp(view_to_uv(position, proj), vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
    // let sample_position = textureSample(standard_pass_position_texture, position_sampler, sample_uv);
    // return sample_position;

    // return vec4(abs(position.z - sample_position.z), 0.0, 0.0, 1.0);
}