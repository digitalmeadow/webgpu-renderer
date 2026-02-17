use engine_graphics::primitives::{camera::PerspectiveCamera, global_transform::GlobalTransform};

use crate::{EngineContext, errors::EngineError};

/// Applies transforms to camera matrices and uniforms
pub fn run_engine_camera_systems(context: &mut EngineContext) -> Result<(), EngineError> {
    let mut perspective_cameras = context.world.ecs.query::<(&mut PerspectiveCamera, &GlobalTransform)>();

    for (_entity, (perspective_camera, global_transform)) in perspective_cameras.iter() {
        perspective_camera.update_view_projection_matrix(global_transform);
        perspective_camera.update_uniforms(&context.graphics.surface_state, global_transform);
    }

    Ok(())
}
