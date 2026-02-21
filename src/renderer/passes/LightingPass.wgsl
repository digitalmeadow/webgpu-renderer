// Lighting Pass Shader
// Reads from G-Buffer and outputs lit color

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
};

// G-Buffer inputs (group 0)
@group(0) @binding(0) var sampler_linear: sampler;
@group(0) @binding(1) var gbuffer_albedo: texture_2d<f32>;
@group(0) @binding(2) var gbuffer_normal_roughness: texture_2d<f32>;
@group(0) @binding(3) var gbuffer_metal_roughness: texture_2d<f32>;
@group(0) @binding(4) var gbuffer_depth: texture_depth_2d;

// Camera uniforms (group 1)
struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(1) @binding(0) var<uniform> camera_uniforms: CameraUniforms;

// Shadow resources (group 2)
@group(2) @binding(0) var shadow_sampler: sampler_comparison;
@group(2) @binding(1) var shadow_texture: texture_depth_2d;

// Shadow + Light uniforms (group 2, binding 2)
struct ShadowLightUniforms {
    lightViewProjMatrix: mat4x4<f32>,
    lightPos: vec4<f32>,
    direction: vec4<f32>,
    color_intensity: vec4<f32>,
}

@group(2) @binding(2) var<uniform> shadow_light_uniforms: ShadowLightUniforms;

// Scene (group 3)
struct SceneUniforms {
    ambient_light_color: vec4<f32>,
}

@group(3) @binding(0) var<uniform> scene_uniforms: SceneUniforms;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
}

fn getShadow(world_pos: vec3<f32>, normal: vec3<f32>) -> f32 {
    let light_space_pos = shadow_light_uniforms.lightViewProjMatrix * vec4<f32>(world_pos, 1.0);
    
    // XY to [0,1] texture coords (Y flipped for texture coordinate system)
    let shadow_coords = vec2<f32>(
        light_space_pos.x * 0.5 + 0.5,
        light_space_pos.y * -0.5 + 0.5
    );
    
    // Clamp to valid texture range
    let clamped_coords = clamp(shadow_coords, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
    
    // Ortho near is negative, so depth is in [-1, 1]. Convert to [0, 1] for texture sampling.
    // Then apply small bias to prevent shadow acne
    let current_depth = light_space_pos.z * 0.5 + 0.5 - 0.001;
    
    let shadow = textureSampleCompare(shadow_texture, shadow_sampler, clamped_coords, current_depth);
    
    return shadow;
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

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;

    // Sample G-Buffer
    let albedo = textureSample(gbuffer_albedo, sampler_linear, in.uv_coords).rgb;
    let normal_roughness = textureSample(gbuffer_normal_roughness, sampler_linear, in.uv_coords);
    let normal = normal_roughness.rgb;
    let roughness = normal_roughness.a;
    let depth = textureLoad(gbuffer_depth, vec2<i32>(in.uv_coords * vec2<f32>(textureDimensions(gbuffer_depth))), 0);

    // DEBUG: Output normal as color to check if normals are working
    let debug_normal_color = normal * 0.5 + 0.5;
    
    // DEBUG: Check depth values
    let debug_depth_color = vec3<f32>(depth);

    var color = albedo * scene_uniforms.ambient_light_color.rgb;

    // Reconstruct world position from depth
    // clip → view: use projection_matrix_inverse
    // view → world: use view_matrix_inverse (NOT view_matrix!)
    let uv = in.uv_coords;
    let clip_pos = vec4<f32>(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    let view_pos = camera_uniforms.projection_matrix_inverse * clip_pos;
    let world_pos = camera_uniforms.view_matrix_inverse * view_pos;
    let world_pos_3d = world_pos.xyz / world_pos.w;

    // DEBUG: Additional debug values
    let camera_to_frag = length(world_pos_3d - camera_uniforms.position.xyz);
    let debug_camera_dist = vec3<f32>(camera_to_frag / 60.0);
    
    // DEBUG: Shadow coords
    let light_space_pos_debug = shadow_light_uniforms.lightViewProjMatrix * vec4<f32>(world_pos_3d, 1.0);
    let shadow_coords_debug = vec2<f32>(
        light_space_pos_debug.x * 0.5 + 0.5,
        light_space_pos_debug.y * -0.5 + 0.5
    );
    // Z stays in clip space [-1,1], map to [0,1] for display
    let debug_shadow_coords = vec3<f32>(shadow_coords_debug, light_space_pos_debug.z * 0.5 + 0.5);

    // DEBUG: Raw shadow depth texture sample
    let shadow_tex_coords = vec2<i32>(shadow_coords_debug * vec2<f32>(2048.0));
    let shadow_depth_raw = textureLoad(shadow_texture, shadow_tex_coords, 0);
    let debug_shadow_depth_raw = vec3<f32>(shadow_depth_raw);
    
    // DEBUG: Check if directional light data is valid
    let debug_light_dir = shadow_light_uniforms.direction.xyz;
    let debug_light_color = shadow_light_uniforms.color_intensity.rgb;
    let debug_light_intensity = shadow_light_uniforms.color_intensity.a;
    let debug_diffuse_check = max(dot(normalize(normal), normalize(-debug_light_dir)), 0.0);

    // Directional lighting with shadows
    let N = normalize(normal);
    let L = normalize(-shadow_light_uniforms.direction.xyz);
    let diffuse = max(dot(N, L), 0.0);
    
    // Use actual shadow calculation
    let shadow = getShadow(world_pos_3d, N);
    
    // DEBUG: Show shadow calculation values  
    let depth_debug = light_space_pos_debug.z * 0.5 + 0.5;
    
    // Raw shadow texture value
    let clamped_tex_coords = vec2<i32>(clamp(shadow_coords_debug * vec2<f32>(2048.0), vec2<f32>(0.0, 0.0), vec2<f32>(2047.0, 2047.0)));
    let shadow_tex_val = textureLoad(shadow_texture, clamped_tex_coords, 0);
    
    // Show: R=shadow coords X, G=shadow coords Y, B=depth, A=raw texture value
    color = vec3<f32>(shadow_coords_debug.x, shadow_coords_debug.y, depth_debug);
    
    // color = vec3<f32>(shadow_tex_val); // Raw shadow texture value
    
    let light_color = shadow_light_uniforms.color_intensity.rgb;
    let light_intensity = shadow_light_uniforms.color_intensity.a;
    
    color += albedo * light_color * light_intensity * diffuse * shadow;

    // DEBUG OUTPUT: Uncomment one of these to debug
    
    // Option 1: Show albedo only (no lighting)
    // Working
    // color = albedo;
    
    // Option 2: Show normal as color
    // Working
    // color = debug_normal_color;
    
    // Option 3: Show depth
    // Not really working (have to get right up to the mesh for it to darken)
    // color = debug_depth_color;
    
    // Option 4: Show light direction (if this is colorful, light dir is valid)
    // Working
    // color = vec3<f32>(debug_light_dir * 0.5 + 0.5);
    
    // Option 5: Show diffuse value (white = lit, black = unlit)
    // NOT WORKING - BLACK
    // color = vec3<f32>(debug_diffuse_check);
    
    // Option 6: Show shadow value (white = fully lit, black = fully shadowed)
    // Should work now
    color = vec3<f32>(shadow);
    
    // Option 7: Show light space Z depth
    // Shows the depth value being compared against shadow map (clip space [-1,1])
    // Map to [0,1] for display: -1 -> 0, 1 -> 1
    let light_space_z = light_space_pos_debug.z * 0.5 + 0.5;
    // WORKING? Mostly grey, background show black to white gradient
    // color = vec3<f32>(light_space_z);
    // color = vec3<f32>(shadow_coords, 1.0);
    
    // Option 8: Show camera distance (closer = darker, farther = lighter)
    // Working
    // color = debug_camera_dist;
    
    // Option 8: Show shadow coords (new method - matching working example)
    // Shows XYZ: X=shadow coord X, Y=shadow coord Y, Z=light space Z
    // WORKING? Colorful gradients everywhere
    // color = debug_shadow_coords;

    // Option 9: Show light space position (raw XYZ values normalized)
    // color = vec3<f32>(
    // light_space_pos_debug.x * 0.5 + 0.5,
    // light_space_pos_debug.y * 0.5 + 0.5,
    // light_space_pos_debug.z * 0.5 + 0.5
    // );

    // Option 10: Show raw shadow depth texture (what's actually written to shadow map)
    // White = depth 1.0 (clear value, nothing rendered)
    // Black = depth 0.0 (closest to light)
    // If you see mostly white, nothing is being rendered to shadow map
    // Should work now
    // MAYBE WORKING - GREY MESHES, WHITE BACKGROUND
    // color = debug_shadow_depth_raw;

    // Option 11: Show light color * intensity
    // NOT WORKING ALL WHITE
    // color = debug_light_color * debug_light_intensity;

    output.color = vec4<f32>(color, 1.0);
    return output;
}
