use engine_maths::Isometry3;
use rapier3d::{
    dynamics::{RigidBodyBuilder, RigidBodyHandle},
    geometry::ColliderHandle,
    prelude::Collider,
};

use crate::{PhysicsContext, errors::EnginePhysicsError};

#[derive(Debug)]
pub struct DynamicBody {
    pub rigid_body_handle: RigidBodyHandle,
    pub collider_handle: ColliderHandle,
}

impl DynamicBody {
    pub fn new(
        physics_context: &mut PhysicsContext,
        collider: Collider,
        isometry: Isometry3<f32>,
        ccd_enabled: bool,
    ) -> Result<Self, EnginePhysicsError> {
        let builder = RigidBodyBuilder::dynamic().pose(isometry).can_sleep(false).ccd_enabled(ccd_enabled);
        let rigid_body = builder.build();

        let rigid_body_handle = physics_context.rigid_body_set.insert(rigid_body);
        let collider_handle =
            physics_context
                .collider_set
                .insert_with_parent(collider, rigid_body_handle, &mut physics_context.rigid_body_set);

        Ok(Self {
            rigid_body_handle,
            collider_handle,
        })
    }
}
