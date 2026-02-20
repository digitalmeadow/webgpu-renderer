pub struct ParticleInstance {
    /// Simultaneously spawned particles are given unique indices
    pub spawn_index: usize,
    pub position: [f32; 3],
    pub scale: f32,
    pub rotation: [f32; 4],
    pub velocity: [f32; 3],
    pub lifetime: f32,
    pub atlas_region_index: u32,
    pub gradient_map_index: u32,
    pub alpha: f32,
    pub billboard: u32,
    pub frame_lerp: f32,
}

// Stripped down data passed to wgpu
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ParticleInstanceBuffer {
    pub position: [f32; 3],
    pub scale: f32,
    pub rotation: [f32; 4],
    pub atlas_region_index: u32,
    pub gradient_map_index: u32,
    pub alpha: f32,
    pub billboard: u32,
    pub frame_lerp: f32,
}
