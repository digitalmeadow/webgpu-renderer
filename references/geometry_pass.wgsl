// Vertex buffer
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) view_position: vec4<f32>,
    @location(3) uv_coords: vec2<f32>
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

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

// Mesh uniforms
struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, 128>, // MAX_JOINTS = 128
    apply_skinning: u32,
}

@group(2) @binding(0) var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(
    in: VertexInput,
) -> VertexOutput {
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );

    // Note: All values output are automatically interpolated across the triangle (modern shader language behaviour)
    var output: VertexOutput;

    let skinned_position: vec4<f32> = skin_matrix * in.position;
    // Conditionally apply skinning
    var final_position: vec4<f32> = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));

    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * final_position;
    output.vertex_position = model_position;

    let view_position = camera_uniforms.view_matrix * model_position;
    output.view_position = view_position;

    var clip_position = camera_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;

    // Recalculate the normal albedo on the model matrix (works only for uniform scaling by exploiting w=0)
    let normal: vec3<f32> = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    // UV
    output.uv_coords = in.uv_coords;

    return output;
}

// Material
// Material uniforms
struct MaterialUniforms {
    gradient_map_enabled: u32,
    gradient_map_count: u32,
    gradient_map_index: u32,
}

@group(2) @binding(1) var<uniform> material_uniforms: MaterialUniforms;
@group(2) @binding(2) var albedo_texture: texture_2d<f32>;
@group(2) @binding(3) var metalness_roughness_texture: texture_2d<f32>;
@group(2) @binding(4) var environment_texture: texture_cube<f32>;
@group(2) @binding(5) var gradient_map_texture: texture_2d<f32>;

@group(3) @binding(0) var sampler_linear: sampler;

struct FragmentOutput {
    @location(0) albedo_metalness: vec4<f32>,
    @location(1) normal_roughness: vec4<f32>
};

// Fragment shader
@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    let metalness_roughness: vec4<f32> = textureSample(metalness_roughness_texture, sampler_linear, in.uv_coords);

    // Normal
    let normal: vec3<f32> = normalize(in.vertex_normal.xyz);
    let view: vec3<f32> = normalize(camera_uniforms.position.xyz - in.vertex_position.xyz);  // Subtraction gets a vector pointing from the vertex to the eye
    let normal_view: vec3<f32> = (camera_uniforms.view_matrix * vec4(normal, 0.0)).xyz;

    // Roughness
    let roughness = metalness_roughness.g;

    output.normal_roughness = vec4(normal_view, roughness);

    // Albedo
    let albedo: vec3<f32> = textureSample(albedo_texture, sampler_linear, in.uv_coords).rgb;

    // Gradient mapping
    let lighting_scalar = clamp(length(albedo.rgb) / 3.0, 0.0, 1.0);
    let gradient_selection = f32(material_uniforms.gradient_map_index) / max(1.0, f32(material_uniforms.gradient_map_count));
    
    // x-axis = color selection, y-axis = gradient selection
    let gradient_map_uv = vec2(lighting_scalar, gradient_selection);
    let color_mapped = textureSample(gradient_map_texture, sampler_linear, gradient_map_uv);
    let color_decided = select(albedo.rgb, color_mapped.rgb, bool(material_uniforms.gradient_map_enabled));

    // Metalness
    let metalness = metalness_roughness.b;

    output.albedo_metalness = vec4(color_decided, metalness);

    return output;
}