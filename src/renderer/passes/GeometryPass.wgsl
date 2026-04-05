const MAX_JOINTS: u32 = 64u;

struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
  emissive: vec4<f32>,
  alpha_cutoff: f32,
};

//--HOOK_PLACEHOLDER_UNIFORMS--//

fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, defaultSampler, uv);
}

fn get_emissive(uv: vec2<f32>) -> vec4<f32> {
    let emissive_tex = textureSample(emissiveTexture, defaultSampler, uv);
    let emissive_color = emissive_tex.rgb * material.emissive.rgb;
    let intensity = max(max(emissive_color.r, emissive_color.g), emissive_color.b);
    return vec4<f32>(emissive_color, intensity);
}

//--HOOK_PLACEHOLDER_ALBEDO--//

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) world_position: vec3<f32>,
    @location(3) world_tangent: vec4<f32>,
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
    billboardAxis: u32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> model: MeshUniforms;

fn get_billboard_axis(axis: u32) -> vec3<f32> {
    return select(
        select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), axis == 1u),
        vec3<f32>(0.0, 1.0, 0.0),
        axis == 2u
    );
}

fn compute_billboard_orientation(mesh_pos: vec3<f32>, axisVec: vec3<f32>) -> mat3x3<f32> {
    let forward = normalize(camera.position.xyz - mesh_pos);

    let forwardDotAxis = dot(forward, axisVec);
    let is_edge_case = abs(forwardDotAxis) > 0.995;

    var safe_forward = forward;
    if (is_edge_case) {
        let axis_component = select(0.0, 1.0, abs(axisVec.x) > 0.5);
        let default_fwd = select(
            vec3<f32>(0.0, 0.0, 1.0),
            vec3<f32>(1.0, 0.0, 0.0),
            axis_component > 0.5
        );
        safe_forward = default_fwd - axisVec * dot(default_fwd, axisVec);
        safe_forward = normalize(safe_forward);
    }

    let right = normalize(cross(safe_forward, axisVec));
    let up = axisVec;
    let billboard_forward = -safe_forward;

    return mat3x3<f32>(right, up, billboard_forward);
}

@group(2) @binding(0) var defaultSampler: sampler;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;
@group(2) @binding(2) var normalTexture: texture_2d<f32>;
@group(2) @binding(3) var metalnessRoughnessTexture: texture_2d<f32>;
@group(2) @binding(4) var<uniform> material: MaterialUniforms;
@group(2) @binding(5) var environmentTexture: texture_cube<f32>;
@group(2) @binding(6) var envSampler: sampler;
@group(2) @binding(7) var emissiveTexture: texture_2d<f32>;

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
    @location(5) tangent: vec4<f32>,
) -> VertexOutput {
    var output: VertexOutput;

    var skin_matrix = mat4x4<f32>(
        joint_weights.x * model.joint_matrices[i32(joint_indices.x)] +
        joint_weights.y * model.joint_matrices[i32(joint_indices.y)] +
        joint_weights.z * model.joint_matrices[i32(joint_indices.z)] +
        joint_weights.w * model.joint_matrices[i32(joint_indices.w)]
    );

    let skinned_position = skin_matrix * position;
    let local_pos = select(position.xyz, skinned_position.xyz, bool(model.apply_skinning));
    let local_normal = normal;

    // Extract world position from model matrix translation (column 4)
    let mesh_pos = model.model_transform_matrix[3].xyz;
    
    // Apply billboarding if enabled
    if (model.billboardAxis != 0u) {
        let axisVec = get_billboard_axis(model.billboardAxis);
        let billboard_matrix = compute_billboard_orientation(mesh_pos, axisVec);
        
        let billboarded_pos = billboard_matrix * local_pos;
        let billboarded_normal = billboard_matrix * local_normal;
        output.world_position = mesh_pos + billboarded_pos;
        output.world_normal = (model.model_transform_matrix * vec4<f32>(billboarded_normal, 0.0)).xyz;
        output.world_tangent = (model.model_transform_matrix * vec4<f32>(billboarded_normal, 0.0));
    } else {
        let world_position = model.model_transform_matrix * vec4<f32>(local_pos, 1.0);
        output.world_position = world_position.xyz;
        output.world_normal = (model.model_transform_matrix * vec4<f32>(local_normal, 0.0)).xyz;
        output.world_tangent = (model.model_transform_matrix * vec4<f32>(tangent.xyz, 0.0));
    }
    
    output.uv_coords = uv;

    let view_position = camera.view_matrix * vec4<f32>(output.world_position, 1.0);
    output.position = camera.view_projection_matrix * vec4<f32>(output.world_position, 1.0);

    return output;
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metal_rough: vec4<f32>,
    @location(3) emissive: vec4<f32>,
};


@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    var output: GBufferOutput;

    let albedo_tex = get_albedo_color(in.uv_coords);
    let base_albedo = albedo_tex.rgb * material.color.rgb;
    let final_alpha = albedo_tex.a * material.opacity;

    // Alpha discard for alpha-tested materials (mask mode)
    if (material.alpha_cutoff > 0.0 && final_alpha < material.alpha_cutoff) {
      discard;
    } 

    if (albedo_tex.a <= 0.0) {
      discard;
    }

    let N_map = textureSample(normalTexture, defaultSampler, in.uv_coords).rgb;
    let N_tangent = N_map * 2.0 - 1.0;
    
    let N = normalize(in.world_normal);
    let T = normalize(in.world_tangent.xyz - dot(in.world_tangent.xyz, N) * N);
    let B = cross(N, T) * in.world_tangent.w;
    let TBN = mat3x3(T, B, N);
    
    let world_N = normalize(TBN * N_tangent);
    output.normal = vec4<f32>(world_N, 1.0);

    let metal_rough = textureSample(metalnessRoughnessTexture, defaultSampler, in.uv_coords);
    let roughness = metal_rough.g;
    let metalness = metal_rough.b;
    let emissive = get_emissive(in.uv_coords);
    output.metal_rough = vec4<f32>(metalness, roughness, 0.0, emissive.a);
    output.emissive = emissive;

    output.albedo = vec4<f32>(base_albedo, albedo_tex.a * material.opacity);

    return output;
}
