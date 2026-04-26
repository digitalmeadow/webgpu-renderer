struct MaterialUniforms {
  color: vec4<f32>,
  opacity: f32,
  environment_texture_id: f32,
  @align(16) emissive: vec4<f32>,
  alpha_cutoff: f32,
  use_dithering: f32,
};

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

struct InstanceInput {
    @location(6) model_matrix_0: vec4<f32>,
    @location(7) model_matrix_1: vec4<f32>,
    @location(8) model_matrix_2: vec4<f32>,
    @location(9) model_matrix_3: vec4<f32>,
    @location(10) billboard_axis: u32,
    @location(11) custom_data_0: vec4<f32>,
    @location(12) custom_data_1: vec4<f32>,
}

@group(0) @binding(0) var<uniform> light_directional_uniforms: LightDirectionalUniforms;

fn get_billboard_axis(axis: u32) -> vec3<f32> {
    return select(
        select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), axis == 1u),
        vec3<f32>(0.0, 1.0, 0.0),
        axis == 2u
    );
}

fn compute_billboard_orientation(mesh_pos: vec3<f32>, axisVec: vec3<f32>) -> mat3x3<f32> {
    // For a directional light, the "viewer" is at infinity.
    // The forward vector should point from the light source towards the object, 
    // which is the same as the light's direction.
    let forward = normalize(light_directional_uniforms.direction.xyz);

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

    let right = normalize(cross(axisVec, safe_forward));
    let up = axisVec;

    return mat3x3<f32>(right, up, safe_forward);
}

@group(1) @binding(0) var nearestSampler: sampler;
@group(1) @binding(1) var albedoTexture: texture_2d<f32>;
@group(1) @binding(2) var normalTexture: texture_2d<f32>;
@group(1) @binding(3) var metalnessRoughnessTexture: texture_2d<f32>;
@group(1) @binding(4) var<uniform> material: MaterialUniforms;
@group(1) @binding(5) var environmentTexture: texture_cube<f32>;
@group(1) @binding(6) var envSampler: sampler;
@group(1) @binding(7) var emissiveTexture: texture_2d<f32>;
@group(1) @binding(8) var linearSampler: sampler;

@vertex
fn vs_main(in: VertexInput, instance: InstanceInput) -> VertexOutput {
    var output: VertexOutput;
    
    // Reconstruct model matrix from instance data
    let model_matrix = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );
    
    // Note: Skinning removed for instanced rendering
    let local_pos = in.position.xyz;

    let mesh_pos = model_matrix[3].xyz;
    var final_local_pos = local_pos;

    if (instance.billboard_axis != 0u) {
        let axisVec = get_billboard_axis(instance.billboard_axis);
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

    let model_position = model_matrix * vec4<f32>(final_local_pos, 1.0);
    let clip_position = light_directional_uniforms.view_projection_matrices[light_directional_uniforms.active_view_projection_index] * model_position;
    output.position = clip_position;
    output.uv = in.uv;
    
    return output;
}

@fragment
fn fs_main(in: VertexOutput) {
    let albedo = textureSample(albedoTexture, nearestSampler, in.uv);
    if (albedo.a < material.alpha_cutoff) {
        discard;
    }
}
