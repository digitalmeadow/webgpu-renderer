use engine_graphics::primitives::{
    camera::PerspectiveCamera, global_transform::GlobalTransform, light_directional::LightDirectional, light_spot::LightSpot,
};
use engine_world::errors::EngineWorldError;

use crate::{EngineContext, errors::EngineError};

/// Applies transforms to lights matrices and uniforms
pub fn run_engine_lights_systems(context: &mut EngineContext) -> Result<(), EngineError> {
    // Directional
    let mut lights_directional = context.world.ecs.query::<&mut LightDirectional>();

    if let Some(camera) = context.world.active_camera {
        let mut camera_query = context
            .world
            .ecs
            .query_one::<&PerspectiveCamera>(camera)
            .map_err(|_| EngineWorldError::EntityNotFound("Camera".to_string()))?;

        let camera = camera_query.get().ok_or(EngineWorldError::EntityNotFound("Camera".to_string()))?;

        for (_entity, light_directional) in lights_directional.iter() {
            let camera_frustum_corners = camera.compute_view_frustum_corners_world_space_coordinates()?;

            light_directional.update_cascade_splits(camera.near, camera.far);

            light_directional.update_view_projection_matrices_from_camera_frustum_corners(&camera_frustum_corners);
            light_directional.update_uniforms(&context.graphics.surface_state);
        }
    }

    // Spots
    let mut light_spots = context.world.ecs.query::<(&mut LightSpot, &GlobalTransform)>();

    for (_entity, (light_spot, global_transform)) in light_spots.iter() {
        light_spot.update_view_projection_matrix(global_transform);
        light_spot.update_uniforms(&context.graphics.surface_state, global_transform);
    }

    Ok(())
}
