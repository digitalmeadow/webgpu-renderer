use engine_graphics::primitives::{aabb::AABB, global_transform::GlobalTransform};

use crate::{EngineContext, errors::EngineError};

/// Applies transforms to AABBs
pub fn run_engine_aabb_systems(context: &mut EngineContext) -> Result<(), EngineError> {
    let mut aabbs = context.world.ecs.query::<(&mut AABB, &GlobalTransform)>();

    for (_entity, (aabb, global_transform)) in aabbs.iter() {
        aabb.update(global_transform);
    }

    Ok(())
}
