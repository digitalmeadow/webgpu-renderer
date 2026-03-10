use engine_maths::Vector3;
use rapier3d::prelude::{RigidBodyHandle, RigidBodySet};

use crate::errors::EnginePhysicsError;

#[derive(Debug, Clone)]
pub struct SpringConnector {
    pub config: SpringConnectorConfig,
    pub rigid_body1: RigidBodyHandle,
    pub rigid_body2: RigidBodyHandle,
}

#[derive(Debug, Clone)]
pub struct SpringConnectorConfig {
    pub stiffness: f32,
    pub rest_length: f32,
}

impl Default for SpringConnectorConfig {
    fn default() -> Self {
        Self {
            stiffness: 50.0,
            rest_length: 0.0,
        }
    }
}

impl SpringConnector {
    pub fn new(config: SpringConnectorConfig, rigid_body1: RigidBodyHandle, rigid_body2: RigidBodyHandle) -> Self {
        Self {
            config,
            rigid_body1,
            rigid_body2,
        }
    }

    pub fn calculate_force(&mut self, rigid_body_set: &mut RigidBodySet) -> Result<Vector3<f32>, EnginePhysicsError> {
        let rigid_body1 = rigid_body_set
            .get(self.rigid_body1)
            .ok_or(EnginePhysicsError::RigidBodyNotFound())?;

        let rigid_body2 = rigid_body_set
            .get(self.rigid_body2)
            .ok_or(EnginePhysicsError::RigidBodyNotFound())?;

        // Calculate forces
        let vector_between_bodies = rigid_body1.position().translation.vector - rigid_body2.position().translation.vector;
        let spring_extension = vector_between_bodies.magnitude() - self.config.rest_length;

        let force_impulse_base = vector_between_bodies.normalize() * spring_extension;
        let force_impulse_scaled = force_impulse_base * self.config.stiffness;

        let force_impulse = force_impulse_scaled;

        Ok(force_impulse)
    }

    pub fn apply_force(&mut self, rigid_body_set: &mut RigidBodySet, impulse_vector: Vector3<f32>) -> Result<(), EnginePhysicsError> {
        {
            let rigid_body1 = rigid_body_set
                .get_mut(self.rigid_body1)
                .ok_or(EnginePhysicsError::RigidBodyNotFound())?;
            rigid_body1.apply_impulse(-impulse_vector, true);
        }

        {
            let rigid_body2 = rigid_body_set
                .get_mut(self.rigid_body2)
                .ok_or(EnginePhysicsError::RigidBodyNotFound())?;

            rigid_body2.apply_impulse(impulse_vector, true);
        }

        Ok(())
    }
}
