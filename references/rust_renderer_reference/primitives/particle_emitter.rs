use engine_maths::Point3;
use engine_timing::time::TimeContext;

use crate::{
    SurfaceState,
    primitives::{
        global_transform::GlobalTransform, mesh_particle::MeshParticle, particle_instance::ParticleInstance,
        particle_system::ParticleSystem,
    },
};

pub struct ParticleEmitterDesc {
    /// Amount of particles spawned at a time
    pub spawn_count: usize,
    /// Rate at which particles are spawned (per second)
    pub spawn_rate: f32,
    /// Transforms
    pub spawn_positions: Vec<[f32; 3]>,
    pub spawn_scales: Vec<f32>,
    pub spawn_rotations: Vec<[f32; 4]>,
    pub spawn_velocities: Vec<[f32; 3]>,
    pub spawn_lifetimes: Vec<f32>,
    pub spawn_alphas: Vec<f32>,
    pub spawn_billboards: Vec<u32>,
}

pub struct ParticleEmitter {
    pub desc: ParticleEmitterDesc,
    pub system: ParticleSystem,
    pub time_since_last_spawn: f32,
}

impl ParticleEmitter {
    pub fn new(surface_state: &mut SurfaceState, mesh_particle: MeshParticle, max_instances: usize, desc: ParticleEmitterDesc) -> Self {
        let system = ParticleSystem::new(surface_state, mesh_particle, max_instances);

        Self {
            desc,
            system,
            time_since_last_spawn: 0.0,
        }
    }

    pub fn update(&mut self, surface_state: &mut SurfaceState, time_context: &TimeContext, global_transform: &GlobalTransform) {
        self.time_since_last_spawn += time_context.delta;

        // Spawn new particles based on spawn_rate
        let spawn_interval = 1.0 / self.desc.spawn_rate;

        while self.time_since_last_spawn >= spawn_interval {
            self.time_since_last_spawn -= spawn_interval;

            for spawn_index in 0..self.desc.spawn_count {
                if self.system.instances.len() < self.system.max_instances {
                    let spawn_position = global_transform.matrix().transform_point(&Point3::new(
                        self.desc.spawn_positions[spawn_index][0],
                        self.desc.spawn_positions[spawn_index][1],
                        self.desc.spawn_positions[spawn_index][2],
                    ));

                    self.system.instances.push(ParticleInstance {
                        spawn_index: spawn_index,
                        position: [spawn_position[0], spawn_position[1], spawn_position[2]],
                        scale: self.desc.spawn_scales[spawn_index],
                        rotation: self.desc.spawn_rotations[spawn_index],
                        velocity: self.desc.spawn_velocities[spawn_index],
                        lifetime: self.desc.spawn_lifetimes[spawn_index],
                        atlas_region_index: 0,
                        gradient_map_index: 0,
                        alpha: self.desc.spawn_alphas[spawn_index],
                        billboard: self.desc.spawn_billboards[spawn_index],
                        frame_lerp: 0.0,
                    });
                }
            }
        }

        // Update position and lifetime
        for particle in &mut self.system.instances {
            particle.position[0] += particle.velocity[0] * time_context.delta;
            particle.position[1] += particle.velocity[1] * time_context.delta;
            particle.position[2] += particle.velocity[2] * time_context.delta;
            particle.lifetime -= time_context.delta;
        }

        // Remove expired particles
        self.system.instances.retain(|particle_instance| particle_instance.lifetime > 0.0);

        // Update system buffers
        self.system.update_instance_buffer(surface_state);
    }
}
