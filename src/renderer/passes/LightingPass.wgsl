// Lighting Pass Shader with Shadow Support
// Reads from G-Buffer and outputs lit color with cascaded shadow mapping

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

// G-Buffer inputs (group 0)
@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var gbuffer_albedo: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_normal_roughness: texture_2d<f32>;
@group(0) @binding(3) var gbuffer_metallic_roughness: texture_2d<f32>;
@group(0) @binding(4) var gbuffer_depth: texture_depth_2d;

// Camera uniforms (group 1)
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

// Directional Light Uniforms (group 2)
const MAX_DIRECTIONAL_LIGHTS: u32 = 4;

struct LightDirectionalUniforms {
    view_projection_matrices: array<mat4x4<f32>, 3>,
    cascade_splits: vec4<f32>,
    direction: vec4<f32>,
    color: vec4<f32>,
    active_view_projection_index: u32,
};

struct LightDirectionalUniformsArray {
    lights: array<LightDirectionalUniforms, MAX_DIRECTIONAL_LIGHTS>,
    light_count: u32,
};

@group(2) @binding(0) var sampler_compare: sampler_comparison;
@group(2) @binding(1) var<uniform> light_directional_uniforms: LightDirectionalUniformsArray;
@group(2) @binding(2) var light_directional_shadow_texture: texture_depth_2d_array;

// Scene (group 3)
struct SceneUniforms {
    ambient_light_color: vec4<f32>,
}

@group(3) @binding(0) var<uniform> scene_uniforms: SceneUniforms;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv_coords = positions[vertex_index] * 0.5 + 0.5;
    output.uv_coords.y = 1.0 - output.uv_coords.y;
    
    return output;
}

// Reconstruct view-space position from depth buffer
fn position_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc_x = uv.x * 2.0 - 1.0;
    let ndc_y = (1.0 - uv.y) * 2.0 - 1.0;
    let ndc_z = depth;
    
    let clip_pos = vec4<f32>(ndc_x, ndc_y, ndc_z, 1.0);
    let view_pos = camera_uniforms.projection_matrix_inverse * clip_pos;
    
    return view_pos.xyz / view_pos.w;
}

// Helper: 4x4 matrix inverse (for view matrices)
fn inverse_mat4(m: mat4x4<f32>) -> mat4x4<f32> {
    let inv_rot = transpose(mat3x3<f32>(
        m[0].xyz,
        m[1].xyz,
        m[2].xyz
    ));
    
    let inv_trans = -(inv_rot * m[3].xyz);
    
    return mat4x4<f32>(
        vec4(inv_rot[0], 0.0),
        vec4(inv_rot[1], 0.0),
        vec4(inv_rot[2], 0.0),
        vec4(inv_trans, 1.0)
    );
}

// Select cascade based on view-space depth
fn select_cascade(view_space_z: f32, splits: vec4<f32>) -> u32 {
    if (view_space_z < splits.y) {
        return 0u;
    } else if (view_space_z < splits.z) {
        return 1u;
    } else {
        return 2u;
    }
}

// Fetch directional shadow
fn fetch_light_directional_shadow(light_index: u32, cascade_id: u32, homogeneous_coords: vec4<f32>) -> f32 {
    if (homogeneous_coords.w <= 0.0) {
        return 1.0;
    }
    
    let flip_correction = vec2<f32>(0.5, -0.5);
    let proj_correction = 1.0 / homogeneous_coords.w;
    let uv = homogeneous_coords.xy * flip_correction * proj_correction + vec2<f32>(0.5, 0.5);
    let depth = homogeneous_coords.z * proj_correction;
    
    // Texture layers are organized as: [light0-c0, light0-c1, light0-c2, light1-c0, light1-c1, light1-c2, ...]
    let layer_index = light_index * 3u + cascade_id;
    
    return textureSampleCompareLevel(
        light_directional_shadow_texture, sampler_compare, uv, i32(layer_index), depth
    );
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample G-Buffer
    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_roughness = textureSample(gbuffer_normal_roughness, sampler_linear, in.uv_coords);
    let roughness = normal_roughness.a;
    let depth = textureLoad(gbuffer_depth, vec2<i32>(in.uv_coords * vec2<f32>(textureDimensions(gbuffer_depth))), 0);

    // Reconstruct view-space position
    let view_pos = position_from_depth(in.uv_coords, depth);
    
    // Transform to world space
    let inverse_view = inverse_mat4(camera_uniforms.view_matrix);
    let world_pos = (inverse_view * vec4(view_pos, 1.0)).xyz;
    var world_normal = normalize(normal_roughness.rgb);

    // Fallback to up vector if normal is invalid (all zeros)
    if (dot(world_normal, world_normal) < 0.001) {
        world_normal = vec3<f32>(0.0, 1.0, 0.0);
    }
    
    var color = albedo * scene_uniforms.ambient_light_color.rgb;

    for (var i: u32 = 0u; i < light_directional_uniforms.light_count; i++) {
        let light_uniforms = light_directional_uniforms.lights[i];
        
        if (light_uniforms.color.a > 0.0) {
            let light_dir = normalize(-light_uniforms.direction.xyz);
            let diffuse = max(0.0, dot(world_normal, light_dir));
            
            // Directional light with cascade shadow
            let view_space_z = -view_pos.z;
            let cascade = select_cascade(view_space_z, light_uniforms.cascade_splits);

            let shadow_matrix = light_uniforms.view_projection_matrices[cascade];
            let shadow_coords = shadow_matrix * vec4<f32>(world_pos, 1.0);

            let shadow = fetch_light_directional_shadow(i, cascade, shadow_coords);

            color += albedo * light_uniforms.color.rgb * light_uniforms.color.a * shadow * diffuse;
        }
    }

    output.color = vec4<f32>(color, 1.0);

    return output;
}
