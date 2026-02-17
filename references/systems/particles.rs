use engine_graphics::primitives::{global_transform::GlobalTransform, particle_emitter::ParticleEmitter};

use crate::{EngineContext, errors::EngineError};

pub fn run_engine_particles_systems(context: &mut EngineContext) -> Result<(), EngineError> {
    let mut particle_emitters = context.world.ecs.query::<(&mut ParticleEmitter, &GlobalTransform)>();

    for (_entity, (particle_emitter, global_transform)) in particle_emitters.iter() {
        particle_emitter.update(&mut context.graphics.surface_state, &context.time, global_transform);
    }

    Ok(())
}
