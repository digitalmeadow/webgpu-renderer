use rapier3d::prelude::RigidBodySet;
use spring_connector::SpringConnector;

use crate::errors::EnginePhysicsError;

pub mod spring_connector;

#[derive(Debug)]
pub struct Connectors {
    pub spring_connector_set: Vec<SpringConnector>,
}

impl Connectors {
    pub fn new() -> Self {
        Self {
            spring_connector_set: Vec::new(),
        }
    }

    pub fn add_spring_connector(&mut self, spring_connector: SpringConnector) -> usize {
        let index = self.spring_connector_set.len();
        self.spring_connector_set.push(spring_connector);
        index
    }

    pub fn remove_spring_connector(&mut self, spring_connector_index: usize) {
        self.spring_connector_set.remove(spring_connector_index);
    }

    pub fn update_connectors(&mut self, rigid_body_set: &mut RigidBodySet) -> Result<(), EnginePhysicsError> {
        for spring_connector in &mut self.spring_connector_set {
            let impulse_vector = spring_connector.calculate_force(rigid_body_set)?;
            spring_connector.apply_force(rigid_body_set, impulse_vector)?;
        }

        Ok(())
    }
}
