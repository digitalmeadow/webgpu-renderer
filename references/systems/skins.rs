use engine_graphics::primitives::{global_transform::GlobalTransform, joint::Joint};

use crate::{EngineContext, errors::EngineError};

pub fn run_engine_skins_system(context: &mut EngineContext) -> Result<(), EngineError> {
    // Update joints
    let mut joints = context.world.ecs.query::<(&mut Joint, &GlobalTransform)>();

    for (_entity, (joint, global_transform)) in joints.iter() {
        joint.update_joint_matrices(global_transform);
    }

    Ok(())
}
