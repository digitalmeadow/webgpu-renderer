use std::{error::Error, fmt};

use rapier3d::prelude::ColliderHandle;

#[derive(Debug)]
pub enum EnginePhysicsError {
    RigidBodyNotFound(),
    ColliderNotFound(ColliderHandle),
    UserDataInvalid(),
    PhysicsError(String),
}

impl fmt::Display for EnginePhysicsError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            EnginePhysicsError::RigidBodyNotFound() => write!(f, "RigidBody not found"),
            EnginePhysicsError::ColliderNotFound(collider_handle) => write!(f, "Collider not found: {:?}", collider_handle),
            EnginePhysicsError::UserDataInvalid() => write!(f, "User data invalid"),
            EnginePhysicsError::PhysicsError(msg) => write!(f, "Physics error: {}", msg),
        }
    }
}

impl Error for EnginePhysicsError {}
