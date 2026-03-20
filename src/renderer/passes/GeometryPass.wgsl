const MAX_JOINTS: u32 = 64u;

struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
};

//--HOOK_PLACEHOLDER_UNIFORMS--//

fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, defaultSampler, uv);
}

//--HOOK_PLACEHOLDER_ALBEDO--//

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
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

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, MAX_JOINTS>,
    apply_skinning: u32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: MeshUniforms;

@group(2) @binding(0) var defaultSampler: sampler;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;
@group(2) @binding(2) var normalTexture: texture_2d<f32>;
@group(2) @binding(3) var metalnessRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var<uniform> material: MaterialUniforms;

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
) -> VertexOutput {
    var output: VertexOutput;

    var skin_matrix = mat4x4<f32>(
        joint_weights.x * model.joint_matrices[i32(joint_indices.x)] +
        joint_weights.y * model.joint_matrices[i32(joint_indices.y)] +
        joint_weights.z * model.joint_matrices[i32(joint_indices.z)] +
        joint_weights.w * model.joint_matrices[i32(joint_indices.w)]
    );

    let skinned_position = skin_matrix * position;
    let final_position = select(position, skinned_position, bool(model.apply_skinning));

    let world_position = model.model_transform_matrix * final_position;
    output.world_normal = (model.model_transform_matrix * vec4<f32>(normal, 0.0)).xyz;
    output.uv_coords = uv;

    let view_position = camera.view_matrix * world_position;
    output.position = camera.view_projection_matrix * world_position;

    return output;
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metal_rough: vec4<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    var output: GBufferOutput;

    let albedo_tex = get_albedo_color(in.uv_coords);
    output.albedo = vec4<f32>(albedo_tex.rgb * material.color.rgb, albedo_tex.a * material.opacity);
    output.normal = vec4<f32>(normalize(in.world_normal), 1.0);
    
    let metal_rough = textureSample(metalnessRoughnessTexture, defaultSampler, in.uv_coords);
    output.metal_rough = vec4<f32>(metal_rough.b, metal_rough.g, 0.0, 1.0);

    return output;
}
