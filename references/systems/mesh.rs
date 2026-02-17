use engine_graphics::primitives::{global_transform::GlobalTransform, mesh::Mesh, mesh_particle::MeshParticle, skin::Skin};

use crate::{EngineContext, errors::EngineError};

pub fn run_engine_mesh_system(context: &mut EngineContext) -> Result<(), EngineError> {
    // Update transform uniforms
    {
        let mut meshes = context.world.ecs.query::<(&mut Mesh, &mut GlobalTransform)>();

        for (_entity, (mesh, global_transform)) in meshes.iter() {
            mesh.update_transform_uniforms(&context.graphics.surface_state, &global_transform);
        }
    }

    // Update joint/skinning uniforms
    {
        let mut meshes_skins = context.world.ecs.query::<(&mut Mesh, &Skin)>();

        for (_entity, (mesh, skin)) in meshes_skins.iter() {
            mesh.update_joint_uniforms(&context.graphics.surface_state, &context.world.ecs, &skin)?;
            mesh.update_apply_skinning_uniform(&context.graphics.surface_state, true);
        }
    }

    // Update material uniforms
    {
        let mut meshes = context.world.ecs.query::<&mut Mesh>();

        for (_entity, mesh) in meshes.iter() {
            mesh.update_material_uniforms(&context.graphics.surface_state);
        }
    }

    {
        let mut particle_meshes = context.world.ecs.query::<&mut MeshParticle>();

        for (_entity, particle_mesh) in particle_meshes.iter() {
            particle_mesh.update_material_uniforms(&context.graphics.surface_state);
        }
    }

    Ok(())
}
