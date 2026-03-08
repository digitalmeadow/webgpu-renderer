struct MeshParticleUniforms {
  regions_x: f32,
  regions_y: f32,
  regions_total: f32,
  _padding: f32,
};

struct MaterialParticleUniforms {
  gradient_map_enabled: u32,
  gradient_map_count: u32,
  _padding: vec2<f32>,
};

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near_far: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var<uniform> mesh_particle_uniforms: MeshParticleUniforms;
@group(1) @binding(1) var<uniform> material_particle_uniforms: MaterialParticleUniforms;
@group(1) @binding(2) var atlas_texture: texture_2d<f32>;
@group(1) @binding(3) var gradient_map_texture: texture_2d<f32>;

struct VertexParticleInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
};

struct ParticleInstanceInput {
    @location(3) position: vec3<f32>,
    @location(4) scale: f32,
    @location(5) rotation: vec4<f32>,
    @location(6) atlas_region_index: u32,
    @location(7) gradient_map_index: u32,
    @location(8) alpha: f32,
    @location(9) billboard: u32,
    @location(10) frame_lerp: f32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) uv_coords_next: vec2<f32>,
    @location(2) world_position: vec3<f32>,
    @location(3) alpha: f32,
    @location(4) @interpolate(flat) gradient_map_index: u32,
    @location(5) @interpolate(flat) frame_lerp: f32,
};

fn quat_mul(q1: vec4<f32>, q2: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(
        q1.w * q2.xyz + q2.w * q1.xyz + cross(q1.xyz, q2.xyz),
        q1.w * q2.w - dot(q1.xyz, q2.xyz)
    );
}

fn quat_rotate_vector(q: vec4<f32>, v: vec3<f32>) -> vec3<f32> {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}

@vertex
fn vs_main(
    vertex: VertexParticleInput,
    instance: ParticleInstanceInput,
) -> VertexOutput {
    var out: VertexOutput;

    let instance_rotation = instance.rotation;
    let instance_scale = instance.scale;
    let instance_position = instance.position;

    var local_pos = vertex.position.xyz;

    if (instance.billboard == 1u) {
        let forward = normalize(camera.position.xyz - instance_position);
        let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
        let up = cross(forward, right);

        let billboard_matrix = mat3x3<f32>(right * instance_scale, up * instance_scale, forward * instance_scale);
        local_pos = billboard_matrix * local_pos;
    } else {
        local_pos = quat_rotate_vector(instance_rotation, local_pos) * instance_scale;
    }

    let world_position = local_pos + instance_position;

    out.position = camera.view_projection_matrix * vec4<f32>(world_position, 1.0);
    out.world_position = world_position;
    out.alpha = instance.alpha;
    out.frame_lerp = instance.frame_lerp;
    out.gradient_map_index = instance.gradient_map_index;

    let regions_x = f32(mesh_particle_uniforms.regions_x);
    let regions_y = f32(mesh_particle_uniforms.regions_y);
    let regions_total = f32(mesh_particle_uniforms.regions_total);

    let atlas_capacity = u32(regions_x * regions_y);
    let max_frames = min(u32(regions_total), atlas_capacity);

    let atlas_region_index = min(instance.atlas_region_index, max_frames - 1u);
    let next_index = (atlas_region_index + 1u) % max_frames;

    let region_x_current = f32(atlas_region_index % u32(regions_x));
    let region_y_current = f32(atlas_region_index / u32(regions_x));

    let region_x_next = f32(next_index % u32(regions_x));
    let region_y_next = f32(next_index / u32(regions_x));

    let region_width = 1.0 / regions_x;
    let region_height = 1.0 / regions_y;

    let uv_x_current = map_range(vertex.uv_coords.x, 0.0, 1.0, region_x_current / regions_x, (region_x_current + 1.0) / regions_x);
    let uv_y_current = map_range(vertex.uv_coords.y, 0.0, 1.0, region_y_current / regions_y, (region_y_current + 1.0) / regions_y);
    out.uv_coords = vec2<f32>(uv_x_current, uv_y_current);

    let uv_x_next = map_range(vertex.uv_coords.x, 0.0, 1.0, region_x_next / regions_x, (region_x_next + 1.0) / regions_x);
    let uv_y_next = map_range(vertex.uv_coords.y, 0.0, 1.0, region_y_next / regions_y, (region_y_next + 1.0) / regions_y);
    out.uv_coords_next = vec2<f32>(uv_x_next, uv_y_next);

    return out;
}

@group(2) @binding(0) var texture_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let albedo = textureSample(atlas_texture, texture_sampler, in.uv_coords);
    let albedo_next = textureSample(atlas_texture, texture_sampler, in.uv_coords_next);

    var color = mix(albedo, albedo_next, in.frame_lerp);

    let alpha = color.a * in.alpha;

    let luminance = clamp(dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    let gradient_selection = f32(in.gradient_map_index) / max(1.0, f32(material_particle_uniforms.gradient_map_count));
    
    let gradient_map_uv = vec2<f32>(luminance, gradient_selection);
    let color_mapped = textureSample(gradient_map_texture, texture_sampler, gradient_map_uv);

    let is_gradient_enabled = material_particle_uniforms.gradient_map_enabled == 1u;
    let color_decided = select(color.rgb, color_mapped.rgb, is_gradient_enabled);

    return vec4<f32>(color_decided, alpha);
}
