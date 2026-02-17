use engine_graphics::primitives::{global_transform::GlobalTransform, rotation::Rotation, translation::Translation};
use engine_physics::{
    bodies::{dynamic_body::DynamicBody, kinematic_body::KinematicBody},
    errors::EnginePhysicsError,
};

use crate::EngineContext;

pub fn run_engine_physics_system(context: &mut EngineContext) -> Result<(), EnginePhysicsError> {
    // Kinematics
    let mut physics_kinematics = context.world.ecs.query::<(&GlobalTransform, &KinematicBody)>();

    for (_entity, (global_transform, kinematic_body)) in physics_kinematics.iter() {
        let physics_kinematic_rigid_body = context.physics.get_rigid_body_mut(kinematic_body.rigid_body_handle)?;

        physics_kinematic_rigid_body.set_position(global_transform.similarity().isometry, true);
    }

    // Dynamics
    let mut physics_dynamics = context.world.ecs.query::<(&mut Translation, &mut Rotation, &DynamicBody)>();

    for (_entity, (translation, rotation, dynamic_body)) in physics_dynamics.iter() {
        let physics_dynamic_rigid_body = context.physics.get_rigid_body(dynamic_body.rigid_body_handle)?;

        // Dynamic bodies have their transforms updated to the positions of the rigid bodies
        let physics_dynamic_translation = physics_dynamic_rigid_body.position().translation;
        let physics_dynamic_rotation = physics_dynamic_rigid_body.position().rotation;

        rotation.set(physics_dynamic_rotation);
        translation.set(physics_dynamic_translation);
    }

    Ok(())
}
