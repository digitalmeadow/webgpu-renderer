// Vertex buffer
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) instance_position: vec3<f32>,
    @location(4) instance_scale: f32,
    @location(5) instance_rotation: vec4<f32>,
    @location(6) instance_atlas_region_index: u32,
    @location(7) instance_gradient_map_index: u32,
    @location(8) instance_alpha: f32,
    @location(9) billboard: u32,
    @location(10) frame_lerp: f32
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) view_position: vec4<f32>,
    @location(3) uv_coords: vec2<f32>,
    @location(4) uv_coords_next: vec2<f32>,
    @location(5) gradient_map_index: u32,
    @location(6) depth: f32,
    @location(7) alpha: f32,
    @location(8) frame_lerp: f32
 };

// Uniforms
// Context uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> context_uniforms: ContextUniforms;

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

@group(1) @binding(0)
var<uniform> camera_uniforms: CameraUniforms;

// Material
struct MeshParticleUniforms {
    regions_x: u32,
    regions_y: u32,
    regions_total: u32,
}

@group(2) @binding(0) var <uniform>mesh_particle: MeshParticleUniforms;

fn quat_rotate(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs_main(
    in: VertexInput,
) -> VertexOutput {
    var output: VertexOutput;

    let rotated_pos = quat_rotate(in.instance_rotation, in.position.xyz);
    var model_position: vec4<f32>;

    if (bool(in.billboard)) {
        var view_no_translation = camera_uniforms.view_matrix;
        view_no_translation[3].x = 0.0;
        view_no_translation[3].y = 0.0;
        view_no_translation[3].z = 0.0;

        let billboard_matrix = transpose(view_no_translation);

        // Spin angle: reuse instance_rotation.w (or add a dedicated angle attribute)
        let angle = in.instance_rotation.w;
        let c = cos(angle);
        let s = sin(angle);

        // Rotate in billboard-local XY plane (roll around camera-forward)
        var local = in.position.xyz;
        local = vec3<f32>(
            c * local.x - s * local.y,
            s * local.x + c * local.y,
            local.z
        );

        let billboarded_pos = (billboard_matrix * vec4<f32>(local, 0.0)).xyz;

        model_position = vec4<f32>(
            billboarded_pos * in.instance_scale + in.instance_position,
            1.0
        );
    } else {
        model_position =  vec4<f32>(
            rotated_pos * in.instance_scale + in.instance_position,
            1.0
        );
    }
   
    output.vertex_position = model_position;

    let view_position = camera_uniforms.view_matrix * model_position;
    output.view_position = view_position;

    var clip_position = camera_uniforms.view_projection_matrix * model_position;
    output.position = clip_position;

    let normal: vec3<f32> = vec4(in.normal.xyz, 0.0).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    let depth = map_range(clip_position.z, camera_uniforms.near, camera_uniforms.far, 0.0, 1.0);
    output.depth = depth;

    let atlas_region_index_x = in.instance_atlas_region_index % mesh_particle.regions_x;
    let atlas_region_index_y = in.instance_atlas_region_index / mesh_particle.regions_x;

    let uv_x = map_range(
        in.uv_coords.x,
        0.0,
        1.0,
        f32(atlas_region_index_x) / f32(mesh_particle.regions_x),
        f32(atlas_region_index_x + 1) / f32(mesh_particle.regions_x)
    );
    
    let uv_y = map_range(
        in.uv_coords.y,
        0.0,
        1.0,
        f32(atlas_region_index_y) / f32(mesh_particle.regions_y),
        f32(atlas_region_index_y + 1) / f32(mesh_particle.regions_y)
    );

    output.uv_coords = vec2(uv_x, uv_y);

    let atlas_capacity = mesh_particle.regions_x * mesh_particle.regions_y;
    let max_frames = min(mesh_particle.regions_total, atlas_capacity);
    let current_index = min(in.instance_atlas_region_index, max_frames - 1u);
    let next_index = (current_index + 1u) % max_frames;

    let atlas_region_index_x_next = next_index % mesh_particle.regions_x;
    let atlas_region_index_y_next = next_index / mesh_particle.regions_x;

    let uv_x_next = map_range(
        in.uv_coords.x,
        0.0,
        1.0,
        f32(atlas_region_index_x_next) / f32(mesh_particle.regions_x),
        f32(atlas_region_index_x_next + 1) / f32(mesh_particle.regions_x)
    );
    
    let uv_y_next = map_range(
        in.uv_coords.y,
        0.0,
        1.0,
        f32(atlas_region_index_y_next) / f32(mesh_particle.regions_y),
        f32(atlas_region_index_y_next + 1) / f32(mesh_particle.regions_y)
    );

    output.uv_coords_next = vec2(uv_x_next, uv_y_next);

    output.gradient_map_index = in.instance_gradient_map_index;

    output.alpha = in.instance_alpha;
    output.frame_lerp = in.frame_lerp;

    return output;
}

// Material uniforms
struct MaterialUniforms {
    gradient_map_enabled: u32,
    gradient_map_count: u32,
}

@group(2) @binding(1) var<uniform> material_uniforms: MaterialUniforms;
@group(2) @binding(2) var atlas_texture: texture_2d<f32>;
@group(2) @binding(3) var gradient_map_texture: texture_2d<f32>;

@group(3) @binding(0) var sampler_linear: sampler;

// Fragment shader
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var debug = vec3(1.0, 1.0, 1.0);

    // Texture
    let albedo: vec4<f32> = textureSample(atlas_texture, sampler_linear, in.uv_coords);
    let albedo_next:  vec4<f32> = textureSample(atlas_texture, sampler_linear, in.uv_coords_next);

    var color = mix(albedo, albedo_next, in.frame_lerp);

    // Total alpha controlled by instance
    let alpha = color.a * in.alpha;

    // Albedo alpha by dithered fragment discarding
    let bayerDimensions = 4;
    let dithering_scale = 2.0;
    let x = i32(in.position.x / dithering_scale) % bayerDimensions;
    let y = i32(in.position.y / dithering_scale) % bayerDimensions;

    let threshold = bayerMatrix4x4[x][y] + 1.0 / f32(bayerDimensions * bayerDimensions) + 0.130;

    if (color.a < 1.0 && color.a < threshold) {
        discard;
    }

    // Gradient mapping
    let luminance = clamp(dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    let gradient_selection = f32(in.gradient_map_index) / max(1.0, f32(material_uniforms.gradient_map_count));
    // x-axis = color selection, y-axis = gradient selection
    let gradient_map_uv = vec2(luminance, gradient_selection);
    let color_mapped = textureSample(gradient_map_texture, sampler_linear, gradient_map_uv);

    let color_decided = select(color.rgb, color_mapped.rgb, bool(material_uniforms.gradient_map_enabled));

    color = vec4(color_decided, 1.0);

    return vec4(color.rgb, alpha);
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}

const bayerMatrix4x4 = mat4x4(
    0.0,  8.0,  2.0, 10.0,
    12.0, 4.0,  14.0, 6.0,
    3.0,  11.0, 1.0, 9.0,
    15.0, 7.0,  13.0, 5.0
) / 16.0;