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
    @location(2) world_position: vec3<f32>,
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
@group(2) @binding(5) var environmentTexture: texture_cube<f32>;
@group(2) @binding(6) var envSampler: sampler;

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
    output.world_position = world_position.xyz;
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

const MAX_ENV_MIP_LEVELS: f32 = 3.0;

fn sample_environment_reflection(world_pos: vec3<f32>, world_normal: vec3<f32>, roughness: f32, metalness: f32, base_albedo: vec3<f32>) -> vec3<f32> {
    let V = normalize(camera.position.xyz - world_pos);
    let N = normalize(world_normal);
    let R = reflect(-V, N);
    
    let NdotV = max(dot(N, V), 0.0);
    
    let raw_mip = roughness * MAX_ENV_MIP_LEVELS;
    let mip_low = floor(raw_mip);
    let mip_high = min(mip_low + 1.0, MAX_ENV_MIP_LEVELS);
    let mip_frac = fract(raw_mip);
    
    let color_low = textureSampleLevel(environmentTexture, envSampler, R, mip_low).rgb;
    let color_high = textureSampleLevel(environmentTexture, envSampler, R, mip_high).rgb;
    
    let env_color = mix(color_low, color_high, mip_frac);
    
    let F0_dielectric = 0.04;
    let F0 = mix(vec3(F0_dielectric), base_albedo, metalness);
    
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
    
    let reflection_color = mix(env_color, env_color * base_albedo, metalness);
    
    let roughness_factor = 1.0 - roughness * roughness;
    
    return reflection_color * fresnel * roughness_factor;
}

@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    var output: GBufferOutput;

    let albedo_tex = get_albedo_color(in.uv_coords);
    let base_albedo = albedo_tex.rgb * material.color.rgb;
    output.albedo = vec4<f32>(base_albedo, albedo_tex.a * material.opacity);
    output.normal = vec4<f32>(normalize(in.world_normal), 1.0);
    
    let metal_rough = textureSample(metalnessRoughnessTexture, defaultSampler, in.uv_coords);
    let roughness = metal_rough.g;
    let metalness = metal_rough.b;
    output.metal_rough = vec4<f32>(metalness, roughness, 0.0, 1.0);
    
    let V = normalize(camera.position.xyz - in.world_position);
    let N = normalize(in.world_normal);
    let NdotV = max(dot(N, V), 0.0);
    let F0_dielectric = 0.04;
    let F0 = mix(vec3(F0_dielectric), base_albedo, metalness);
    let fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
    
    let reflections = sample_environment_reflection(in.world_position, in.world_normal, roughness, metalness, base_albedo);
    
    let fresnel_strength = fresnel * (1.0 - roughness * roughness);
    let final_color = base_albedo * (1.0 - fresnel_strength) + reflections;
    
    output.albedo = vec4<f32>(final_color, albedo_tex.a * material.opacity);
    // output.albedo = vec4(reflections, 1.0); // For debugging reflections only

    return output;
}
