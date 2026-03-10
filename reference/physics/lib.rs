use std::sync::mpsc::Receiver;

use connectors::Connectors;
use engine_maths::Vector3;
use errors::EnginePhysicsError;
use rapier3d::{
    dynamics::{
        CCDSolver, ImpulseJointSet, IntegrationParameters, IslandManager, MultibodyJointSet, RigidBody, RigidBodyHandle, RigidBodySet,
    },
    geometry::{Collider, ColliderHandle, ColliderSet, NarrowPhase},
    pipeline::PhysicsPipeline,
    prelude::{ChannelEventCollector, CollisionEvent, ContactForceEvent, DefaultBroadPhase},
};

pub mod bodies;
pub mod connectors;
pub mod controllers;
pub mod errors;
pub mod utils;

pub struct PhysicsDesc {
    pub delta_target: f32,
    pub gravity: Vector3<f32>,
}

impl Default for PhysicsDesc {
    fn default() -> Self {
        Self {
            delta_target: 1.0 / 60.0,
            gravity: Vector3::new(0.0, -9.81, 0.0),
        }
    }
}

pub struct PhysicsContext {
    // Config
    pub gravity: Vector3<f32>,
    pub integration_parameters: IntegrationParameters,
    pub physics_pipeline: PhysicsPipeline,
    pub island_manager: IslandManager,
    pub broad_phase: DefaultBroadPhase,
    pub narrow_phase: NarrowPhase,
    pub impulse_joint_set: ImpulseJointSet,
    pub multibody_joint_set: MultibodyJointSet,
    pub ccd_solver: CCDSolver,
    pub physics_hooks: (),
    pub event_handler: ChannelEventCollector,
    pub collision_recv: Receiver<CollisionEvent>,
    pub contact_force_recv: Receiver<ContactForceEvent>,

    // Sets
    pub rigid_body_set: RigidBodySet,
    pub collider_set: ColliderSet,

    pub connectors: Connectors,
}

impl PhysicsContext {
    pub fn new(desc: &PhysicsDesc) -> Self {
        // Config
        let gravity = desc.gravity;
        let integration_parameters = IntegrationParameters {
            dt: desc.delta_target,
            max_ccd_substeps: 5,
            ..Default::default()
        };
        let physics_pipeline = PhysicsPipeline::new();
        let island_manager = IslandManager::new();
        let broad_phase = DefaultBroadPhase::new();
        let narrow_phase = NarrowPhase::new();
        let impulse_joint_set = ImpulseJointSet::new();
        let multibody_joint_set = MultibodyJointSet::new();
        let ccd_solver = CCDSolver::new();
        let physics_hooks = ();

        let (collision_send, collision_recv) = std::sync::mpsc::channel();
        let (contact_force_send, contact_force_recv) = std::sync::mpsc::channel();
        let event_handler = ChannelEventCollector::new(collision_send, contact_force_send);

        // Sets
        let rigid_body_set = RigidBodySet::new();
        let collider_set = ColliderSet::new();

        let connectors = Connectors::new();

        Self {
            gravity,
            integration_parameters,
            physics_pipeline,
            island_manager,
            broad_phase,
            narrow_phase,
            impulse_joint_set,
            multibody_joint_set,
            ccd_solver,
            physics_hooks,
            event_handler,
            rigid_body_set,
            collider_set,
            collision_recv,
            contact_force_recv,
            connectors,
        }
    }

    // Utils
    pub fn get_rigid_body(&self, rigid_body_handle: RigidBodyHandle) -> Result<&RigidBody, EnginePhysicsError> {
        self.rigid_body_set
            .get(rigid_body_handle)
            .ok_or(EnginePhysicsError::RigidBodyNotFound())
    }

    pub fn get_rigid_body_mut(&mut self, rigid_body_handle: RigidBodyHandle) -> Result<&mut RigidBody, EnginePhysicsError> {
        self.rigid_body_set
            .get_mut(rigid_body_handle)
            .ok_or(EnginePhysicsError::RigidBodyNotFound())
    }

    pub fn remove_rigid_body(&mut self, rigid_body_handle: RigidBodyHandle) -> Result<RigidBody, EnginePhysicsError> {
        self.rigid_body_set
            .remove(
                rigid_body_handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            )
            .ok_or(EnginePhysicsError::RigidBodyNotFound())
    }

    pub fn get_collider(&self, collider_handle: ColliderHandle) -> Result<&Collider, EnginePhysicsError> {
        self.collider_set
            .get(collider_handle)
            .ok_or(EnginePhysicsError::ColliderNotFound(collider_handle))
    }

    pub fn update(&mut self) -> Result<(), EnginePhysicsError> {
        self.physics_pipeline.step(
            &self.gravity,
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            &self.physics_hooks,
            &self.event_handler,
        );

        self.connectors.update_connectors(&mut self.rigid_body_set)?;
        Ok(())
    }
}
