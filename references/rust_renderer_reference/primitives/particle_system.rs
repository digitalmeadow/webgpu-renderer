use crate::{
    SurfaceState,
    primitives::{
        mesh_particle::MeshParticle,
        particle_instance::{ParticleInstance, ParticleInstanceBuffer},
    },
};

pub struct ParticleSystem {
    pub mesh_particle: MeshParticle,
    pub instances: Vec<ParticleInstance>,
    pub max_instances: usize,
    pub wgpu_instances_buffer: wgpu::Buffer,
}

impl ParticleSystem {
    pub fn new(surface_state: &mut SurfaceState, mesh_particle: MeshParticle, max_instances: usize) -> Self {
        let instances = Vec::with_capacity(max_instances);

        let wgpu_instances_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Particle Instances Buffer"),
            // position, scale, rotation, atlas region index, gradient map index
            size: (std::mem::size_of::<ParticleInstanceBuffer>() * max_instances) as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self {
            mesh_particle,
            instances,
            max_instances,
            wgpu_instances_buffer,
        }
    }

    // Add a method to update the buffer with current instance data
    pub fn update_instance_buffer(&self, surface_state: &SurfaceState) {
        let instance_data: Vec<ParticleInstanceBuffer> = self
            .instances
            .iter()
            .map(|p| ParticleInstanceBuffer {
                position: p.position,
                scale: p.scale,
                rotation: p.rotation,
                atlas_region_index: p.atlas_region_index,
                gradient_map_index: p.gradient_map_index,
                alpha: p.alpha,
                billboard: p.billboard,
                frame_lerp: p.frame_lerp,
            })
            .collect();

        surface_state
            .queue
            .write_buffer(&self.wgpu_instances_buffer, 0, bytemuck::cast_slice(&instance_data.as_slice()));
    }
}
