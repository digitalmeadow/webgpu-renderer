use aabb::run_engine_aabb_systems;
use animations::run_engine_animations_system;
use cameras::run_engine_camera_systems;
use mesh::run_engine_mesh_system;
use physics::run_engine_physics_system;
use skins::run_engine_skins_system;
use transforms::run_engine_transforms_system;

use crate::{
    EngineContext,
    errors::EngineError,
    systems::{lights::run_engine_lights_systems, particles::run_engine_particles_systems},
};

mod aabb;
mod animations;
mod cameras;
mod lights;
mod mesh;
mod particles;
mod physics;
mod skins;
mod transforms;

pub fn run_engine_systems(context: &mut EngineContext) -> Result<(), EngineError> {
    run_engine_physics_system(context)?;
    run_engine_skins_system(context)?;
    run_engine_animations_system(context)?;
    run_engine_transforms_system(context)?;
    run_engine_aabb_systems(context)?;
    run_engine_mesh_system(context)?;
    run_engine_particles_systems(context)?;
    run_engine_camera_systems(context)?;
    run_engine_lights_systems(context)?;

    Ok(())
}
