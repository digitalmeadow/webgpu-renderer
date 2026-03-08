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

struct ParticleInstanceData {
  position: vec3<f32>,
  scale: f32,
  rotation: vec4<f32>,
  atlas_region_index: u32,
  gradient_map_index: u32,
  alpha: f32,
  billboard: u32,
  frame_lerp: f32,
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
    @location(1) world_position: vec3<f32>,
    @location(2) alpha: f32,
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
    out.uv_coords = vertex.uv_coords;
    out.world_position = world_position;
    out.alpha = instance.alpha;

    return out;
}

@group(2) @binding(0) var texture_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let regions_x = mesh_particle_uniforms.regions_x;
    let regions_y = mesh_particle_uniforms.regions_y;
    let atlas_region_index = 0u;

    let region_width = 1.0 / regions_x;
    let region_height = 1.0 / regions_y;

    let region_x = f32(atlas_region_index % u32(regions_x));
    let region_y = f32(atlas_region_index / u32(regions_x));

    let uv = vec2<f32>(
        region_width * (in.uv_coords.x + region_x),
        region_height * (in.uv_coords.y + region_y)
    );

    let color = textureSample(atlas_texture, texture_sampler, uv);

    var final_color = color;
    final_color.a *= in.alpha;

    return final_color;
}
