struct MaterialUniforms {
  color: vec4<f32>,           // offset 0-15
  opacity: f32,               // offset 16-19
  environment_texture_id: f32,  // offset 20-23 (environment texture index, 0 = skybox, 1+ = custom env maps)
  // padding: 2 floats          offset 24-31 (implicit, for emissive alignment)
  @align(16) emissive: vec4<f32>,  // offset 32-47
  alpha_cutoff: f32,          // offset 48-51
  use_dithering: f32,         // offset 52-55
  // padding: 2 floats          offset 56-63 (implicit)
};

// Bayer 8x8 dithering matrix (values 0-63, normalized to 0.0-1.0)
const BAYER_MATRIX = array<array<f32, 8>, 8>(
  array<f32, 8>(0.0/64.0,  32.0/64.0, 8.0/64.0,  40.0/64.0, 2.0/64.0,  34.0/64.0, 10.0/64.0, 42.0/64.0),
  array<f32, 8>(48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0),
  array<f32, 8>(12.0/64.0, 44.0/64.0, 4.0/64.0,  36.0/64.0, 14.0/64.0, 46.0/64.0, 6.0/64.0,  38.0/64.0),
  array<f32, 8>(60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0),
  array<f32, 8>(3.0/64.0,  35.0/64.0, 11.0/64.0, 43.0/64.0, 1.0/64.0,  33.0/64.0, 9.0/64.0,  41.0/64.0),
  array<f32, 8>(51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0),
  array<f32, 8>(15.0/64.0, 47.0/64.0, 7.0/64.0,  39.0/64.0, 13.0/64.0, 45.0/64.0, 5.0/64.0,  37.0/64.0),
  array<f32, 8>(63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0)
);

fn get_dither_threshold(screen_pos: vec2<f32>) -> f32 {
  let x = i32(screen_pos.x) % 8;
  let y = i32(screen_pos.y) % 8;
  return BAYER_MATRIX[y][x];
}

//--HOOK_PLACEHOLDER_UNIFORMS--//

// Replaceable via ShaderHooks.albedo. Signature must match exactly.
fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(albedoTexture, nearestSampler, uv);
}

// Replaceable via ShaderHooks.albedo_logic. Signature must match exactly.
fn modify_albedo(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
    return color;
}

// Replaceable via ShaderHooks.vertex_post_process. Signature must match exactly.
fn vertex_post_process(world_pos: vec3<f32>, uv: vec2<f32>, instance: InstanceInput) -> vec3<f32> {
    return world_pos;
}

// Not replaceable via hooks.
fn get_emissive(uv: vec2<f32>) -> vec4<f32> {
    let emissive_tex = textureSample(emissiveTexture, linearSampler, uv);
    let emissive_color = emissive_tex.rgb * material.emissive.rgb;
    let intensity_multiplier = material.emissive.a;
    let final_emissive = emissive_color * intensity_multiplier;
    let bloom_intensity = max(max(final_emissive.r, final_emissive.g), final_emissive.b);
    return vec4<f32>(final_emissive, bloom_intensity);
}

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

struct InstanceInput {
    // Vertex attributes have no mat4 type — split into 4 vec4 and reconstruct in vs_main
    @location(6) model_matrix_0: vec4<f32>,
    @location(7) model_matrix_1: vec4<f32>,
    @location(8) model_matrix_2: vec4<f32>,
    @location(9) model_matrix_3: vec4<f32>,
    @location(10) billboard_axis: u32,
    @location(11) custom_data_0: vec4<f32>,
    @location(12) custom_data_1: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

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

    // cross(forward, axisVec) negates right vs cross(axisVec, forward),
    // flipping triangle winding to CW to match frontFace: "cw"
    let right = normalize(cross(safe_forward, axisVec));
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
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
    @location(5) tangent: vec4<f32>,
    instance: InstanceInput,
) -> VertexOutput {
    var output: VertexOutput;

    // Reconstruct model matrix from instance data
    let model_matrix = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );

    // Note: Skinning removed for instanced rendering
    // If skinning is needed, it must be handled differently
    let local_pos = position.xyz;
    let local_normal = normal;

    // Extract world position from model matrix translation (column 4)
    let mesh_pos = model_matrix[3].xyz;
    
    // Apply billboarding if enabled
    if (instance.billboard_axis != 0u) {
        let axisVec = get_billboard_axis(instance.billboard_axis);
        let billboard_matrix = compute_billboard_orientation(mesh_pos, axisVec);
        
        let billboarded_pos = billboard_matrix * local_pos;
        let billboarded_normal = billboard_matrix * local_normal;
        let billboarded_tangent = billboard_matrix * tangent.xyz;
        
        // World position = mesh translation + billboard-rotated local offset
        output.world_position = mesh_pos + billboarded_pos;
        
        // Billboard normals and tangents are already in world space - 
        // do NOT apply model matrix again, that would re-apply rotation/scale
        output.world_normal = billboarded_normal;
        output.world_tangent = vec4<f32>(billboarded_tangent, tangent.w);
    } else {
        let world_position = model_matrix * vec4<f32>(local_pos, 1.0);
        output.world_position = world_position.xyz;
        output.world_normal = (model_matrix * vec4<f32>(local_normal, 0.0)).xyz;
        // Preserve tangent.w (handedness); w=0 in the transformed vec4 is intentional (direction, not point)
        output.world_tangent = vec4<f32>((model_matrix * vec4<f32>(tangent.xyz, 0.0)).xyz, tangent.w);
    }
    
    output.uv_coords = uv;

    output.world_position = vertex_post_process(output.world_position, uv, instance);

    let view_position = camera.view_matrix * vec4<f32>(output.world_position, 1.0);
    output.position = camera.projection_matrix * view_position;

    return output;
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metal_rough: vec4<f32>,  // r: metalness, g: roughness, b: emissive intensity, a: environment texture ID
    @location(3) emissive: vec4<f32>,
};


@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    var output: GBufferOutput;

    let albedo_tex = modify_albedo(get_albedo_color(in.uv_coords), in.uv_coords);
    let base_albedo = albedo_tex.rgb * material.color.rgb;
    let final_alpha = albedo_tex.a * material.opacity;

    // Dithered alpha: use Bayer matrix threshold
    if (material.use_dithering > 0.5) {
        let dither_threshold = get_dither_threshold(in.position.xy);
        if (final_alpha < dither_threshold) {
            discard;
        }
    }
    // Alpha cutoff for mask mode
    else if (material.alpha_cutoff > 0.0 && final_alpha < material.alpha_cutoff) {
        discard;
    } 

    // Discard fully transparent pixels
    if (albedo_tex.a <= 0.0) {
        discard;
    }

    let N_map = textureSample(normalTexture, nearestSampler, in.uv_coords).rgb;
    var N_tangent = N_map * 2.0 - 1.0;
    // Convert OpenGL (Y-up) → WebGPU/DirectX (Y-down) coordinate system
    // Blender exports glTF normal maps in OpenGL format, so we flip Y
    N_tangent.y = -N_tangent.y;
    
    let N = normalize(in.world_normal);
    let T = normalize(in.world_tangent.xyz - dot(in.world_tangent.xyz, N) * N);
    let B = cross(N, T) * in.world_tangent.w;
    let TBN = mat3x3(T, B, N);
    
    let world_N = normalize(TBN * N_tangent);
    output.normal = vec4<f32>(world_N, 1.0);

    let metal_rough = textureSample(metalnessRoughnessTexture, nearestSampler, in.uv_coords);
    let roughness = metal_rough.g;
    let metalness = metal_rough.b;
    let emissive = get_emissive(in.uv_coords);
    // Store environment texture ID in alpha channel
    output.metal_rough = vec4<f32>(metalness, roughness, 0.0, material.environment_texture_id);
    output.emissive = emissive;

    output.albedo = vec4<f32>(base_albedo, albedo_tex.a * material.opacity);

    return output;
}
