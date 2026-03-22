struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) ray_dir: vec3<f32>,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var skyboxTexture: texture_cube<f32>;
@group(1) @binding(1) var skyboxSampler: sampler;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var output: VertexOutput;
    
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    
    let pos = positions[vertex_index];
    
    let ndc_pos = vec4<f32>(pos, 1.0, 1.0);
    let view_pos = camera.projection_matrix_inverse * ndc_pos;
    let view_dir = vec4<f32>(view_pos.xy, -1.0, 0.0);
    output.ray_dir = (camera.view_matrix_inverse * view_dir).xyz;
    
    output.position = vec4<f32>(pos, 1.0, 1.0);
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let ray_dir = normalize(in.ray_dir);
    return textureSample(skyboxTexture, skyboxSampler, ray_dir);
}
