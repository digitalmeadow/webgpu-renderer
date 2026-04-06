const MAX_JOINTS: u32 = 64u;

struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
    @location(5) tangent: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_index: u32,
};

@group(0) @binding(0) var<uniform> light_directional_uniforms: LightDirectionalUniforms;

struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, MAX_JOINTS>,
    apply_skinning: u32,
    billboardAxis: u32,
}

@group(1) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

fn get_billboard_axis(axis: u32) -> vec3<f32> {
    return select(
        select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), axis == 1u),
        vec3<f32>(0.0, 1.0, 0.0),
        axis == 2u
    );
}

fn compute_billboard_orientation(mesh_pos: vec3<f32>, axisVec: vec3<f32>) -> mat3x3<f32> {
    // For a directional light, the "viewer" is at infinity in the -direction.
    // forward points from the mesh toward the light source (away from the light ray direction).
    let forward = normalize(-light_directional_uniforms.direction.xyz);

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
    let billboard_forward = safe_forward;

    return mat3x3<f32>(right, up, billboard_forward);
}

@group(2) @binding(0) var defaultSampler: sampler;
@group(2) @binding(1) var albedoTexture: texture_2d<f32>;

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );
    
    let skinned_position = skin_matrix * in.position;
    let local_pos = select(in.position.xyz, skinned_position.xyz, bool(mesh_uniforms.apply_skinning));

    let mesh_pos = mesh_uniforms.model_transform_matrix[3].xyz;
    var final_local_pos = local_pos;

    if (mesh_uniforms.billboardAxis != 0u) {
        let axisVec = get_billboard_axis(mesh_uniforms.billboardAxis);
        let billboard_matrix = compute_billboard_orientation(mesh_pos, axisVec);
        let billboarded_pos = billboard_matrix * local_pos;
        // World position = mesh translation + billboard-rotated local offset.
        // Do NOT apply the full model matrix here — that would re-apply rotation/scale
        // on top of the already world-space billboard vertices.
        let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_index] * vec4<f32>(mesh_pos + billboarded_pos, 1.0);
        output.position = clip_position;
        output.uv = in.uv;
        return output;
    }

    let model_position = mesh_uniforms.model_transform_matrix * vec4<f32>(final_local_pos, 1.0);
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_index] * model_position;
    output.position = clip_position;
    output.uv = in.uv;
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @builtin(frag_depth) f32 {
    let albedo = textureSample(albedoTexture, defaultSampler, in.uv);
    if (albedo.a == 0.0) {
        discard;
    }
    return in.position.z / in.position.w;
}
