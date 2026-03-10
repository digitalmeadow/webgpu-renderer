// Based on the official Rapier3d example:
// https://github.com/dimforge/rapier/blob/master/src/control/player_controller.rs

use rapier3d::{
    dynamics::{RigidBodyHandle, RigidBodySet},
    geometry::{BoundingVolume, ColliderHandle, ColliderSet, Shape},
    math::{Isometry, Real, UnitVector, Vector},
    parry::query::{Contact, ShapeCastOptions},
    pipeline::{QueryFilter, QueryFilterFlags, QueryPipeline},
};

use crate::PhysicsContext;

/// Configuration for the auto-stepping player controller feature
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct PlayerAutostep {
    /// The maximum step height a player can automatically step over (should not exceed snap_to_ground)
    pub max_height: Real,
    /// The minimum width of free space that must be available after stepping up max_height
    pub min_width: Real,
    /// Can the player automatically step over dynamic bodies
    pub include_dynamic_body_set: bool,
}

impl Default for PlayerAutostep {
    fn default() -> Self {
        Self {
            max_height: 0.25,
            min_width: 0.5,
            include_dynamic_body_set: true,
        }
    }
}

/// Configuration for the player controller
#[derive(Debug)]
pub struct PlayerControllerConfig {
    /// The direction that goes "up". Used to determine where the floor is, and the floor’s angle
    pub up: UnitVector<Real>,
    /// A small gap to preserve between the player and its surroundings
    pub loosened_offset: Real,
    /// Auto-stepping configuration
    pub autostep: PlayerAutostep,
    /// The angle (degrees) at which the floor becomes a wall
    pub ground_angle: Real,
    /// The distance at which the player will snap to the ground
    pub snap_to_ground: f32,
    /// The acceleration of gravity
    pub gravity_acceleration: Real,
    /// Horizontal velocity damping
    pub damping_xz: Real,
    /// The velocity applied when jumping
    pub jump_velocity: Real,
    /// The factor of control remainig while the player is in the air
    pub air_control: Real,
}

impl Default for PlayerControllerConfig {
    fn default() -> Self {
        Self {
            up: Vector::y_axis(),
            loosened_offset: 0.1,
            autostep: PlayerAutostep::default(),
            ground_angle: 30.0,
            snap_to_ground: 0.5,
            gravity_acceleration: -30.0,
            damping_xz: 0.999,
            jump_velocity: 15.0,
            air_control: 0.015,
        }
    }
}

/// The effective states exhibited by the player controller
#[derive(Debug, Default)]
pub struct PlayerControllerStates {
    pub grounded: bool,
    pub jumping: bool,
    pub on_kinematic_ground: bool,
}

/// The effective movement computed by the player controller returned to the game
#[derive(Debug, Default)]
pub struct PlayerControllerMovement {
    pub initial_position: Isometry<Real>,
    pub current_position: Isometry<Real>,
    pub movement: Isometry<Real>,
    pub desired_translation: Vector<Real>,
    pub allowed_translation: Vector<Real>,
    pub velocity: Vector<Real>,
}

/// The relative effective movement of the ground
#[derive(Debug, Default)]
pub struct GroundMovement {
    /// Position captured by the last frame
    pub previous_position: Option<Isometry<Real>>,
    /// Current position of the ground
    pub current_position: Isometry<Real>,
    /// The movement of the ground which will be applied to the player
    pub movement: Isometry<Real>,
}

/// A player controller for a position based kinematic rigid body
#[derive(Debug, Default)]
pub struct PlayerController {
    // Config settings
    pub config: PlayerControllerConfig,
    /// States
    pub states: PlayerControllerStates,
    /// The movement to apply
    pub movement: PlayerControllerMovement,
    /// Kinematic ground movement
    pub ground_movement: GroundMovement,
}

impl PlayerController {
    /// Computes the possible movement for the player shape
    pub fn calculate_next_position(
        &mut self,
        physics_context: &mut PhysicsContext,
        rigid_body_handle: RigidBodyHandle,
        dt: Real,
        rigid_body_set: &RigidBodySet,
        collider_set: &ColliderSet,
        query_pipeline: &QueryPipeline,
        player_shape: &dyn Shape,
        player_pos: &Isometry<Real>,
        desired_translation: Vector<Real>,
        jump_input: bool,
    ) -> &PlayerControllerMovement {
        // Filter to exclude the current player body from its queries
        let filter = QueryFilter::default().exclude_rigid_body(rigid_body_handle);

        // Initial states
        self.movement.desired_translation = desired_translation;
        self.movement.initial_position = player_pos.clone();
        self.movement.current_position = player_pos.clone();

        // Handle jump input
        self.jump(jump_input);

        // Check if grounded
        self.check_if_grounded(rigid_body_set, collider_set, query_pipeline, player_shape, filter);

        // Modify the movement to account for the environment
        self.apply_gravity(dt);

        // Cast shape and calculate valid movement
        self.cast_movement(physics_context, dt, player_shape, filter);

        // Check for and fix overlaps
        self.check_and_fix_overlaps(rigid_body_set, collider_set, query_pipeline, player_shape, player_pos, filter);

        // Derive translations from calculated positions
        self.calculate_translations();

        // Update velocities based on position calculations
        self.update_velocity(dt);

        // Return the movement
        &self.movement
    }

    fn jump(&mut self, jump_input: bool) {
        if jump_input && self.states.grounded && !self.states.jumping {
            self.movement.velocity.y = self.config.jump_velocity;
            self.states.grounded = false;
            self.states.jumping = true;
        }

        if self.movement.velocity.y < 0.0 {
            self.states.jumping = false;
        }
    }

    fn check_if_grounded(
        &mut self,
        rigid_body_set: &RigidBodySet,
        collider_set: &ColliderSet,
        query_pipeline: &QueryPipeline,
        player_shape: &dyn Shape,
        mut filter: QueryFilter,
    ) {
        // Handle escape traits
        if self.states.jumping {
            self.states.grounded = false;
            return;
        }

        let mut grounded = false;

        // Cast vector = cast_velocity * max_time_of_impact
        let max_time_of_impact = 1.0;
        let offset = Vector::new(0.0, self.config.loosened_offset, 0.0);
        let cast_velocity = Vector::new(0.0, -self.config.snap_to_ground, 0.0);

        // Apply filter to include/exclude kinematic rigid_body_set
        if self.config.autostep.include_dynamic_body_set {
            filter.flags |= QueryFilterFlags::EXCLUDE_DYNAMIC;
        }

        // Cast player shape downwards
        if let Some((collider_handle, hit)) = query_pipeline.cast_shape(
            &self.movement.current_position,
            &cast_velocity,
            player_shape,
            ShapeCastOptions::with_max_time_of_impact(max_time_of_impact),
        ) {
            let surface_normal = hit.normal1;

            // We're grounded if the surface normal is within the configured ground angle threshold
            if surface_normal.dot(&self.config.up.into_inner()) > self.config.ground_angle.to_radians().cos() {
                // If ground detected, snap down to it
                let snap_translation = cast_velocity * hit.time_of_impact + offset;
                self.movement.current_position.translation.vector += snap_translation;
                grounded = true;

                // Handle kinematic ground
                let ground_collider = collider_set.get(collider_handle).unwrap();
                let ground_rigid_body_handle = ground_collider.parent().unwrap();
                let ground_rigid_body = rigid_body_set.get(ground_rigid_body_handle).unwrap();

                if ground_rigid_body.is_kinematic() {
                    // Store the current position of the ground
                    self.ground_movement.current_position = ground_rigid_body.position().clone();

                    // Calculate the relative movement of the ground
                    if let Some(previous_position) = self.ground_movement.previous_position {
                        // Difference between the current and previous translation of the ground
                        self.ground_movement.movement.translation.vector =
                            self.ground_movement.current_position.translation.vector - previous_position.translation.vector;
                    } else {
                        // If there's no previous movement then we've just landed on the ground - hence no relative movement
                        self.ground_movement.movement = Isometry::identity();
                    }

                    // Apply the relative movement of the ground to the player
                    let relative_translation = self.ground_movement.movement.translation.vector;

                    // Apply the relative movement of the ground to the player
                    self.movement.current_position.translation.vector += relative_translation;

                    // Persist the position of the ground for the next frame
                    self.ground_movement.previous_position = Some(self.ground_movement.current_position.clone());

                    self.states.on_kinematic_ground = true;
                } else {
                    // This ensures correct relative movement when the player first lands on a kinematic ground
                    self.ground_movement.previous_position = None;

                    self.states.on_kinematic_ground = false;
                }
            }
        }

        self.states.grounded = grounded;
    }

    fn apply_gravity(&mut self, dt: Real) {
        // Handle escape states
        if self.states.grounded {
            self.movement.velocity.y = 0.0;
            return;
        }

        // Apply gravity
        let gravity_acceleration = self.config.up.into_inner() * self.config.gravity_acceleration;
        self.movement.velocity += gravity_acceleration * dt;
    }

    fn cast_movement(&mut self, physics_context: &mut PhysicsContext, dt: Real, player_shape: &dyn Shape, filter: QueryFilter) {
        // Derive the cast from current player states
        let cast_velocity;

        if self.states.grounded {
            // On the ground, we cast by the desired translation
            cast_velocity = self.movement.desired_translation;
        } else {
            // In the air, we cast by the player velocity and a reduced factor of desired control translation
            cast_velocity = self.movement.velocity * dt + self.movement.desired_translation * self.config.air_control;
        }

        // Cast vector = cast_velocity * max_time_of_impact
        let max_time_of_impact = 1.0 + self.config.loosened_offset;

        let query_pipeline = physics_context.broad_phase.as_query_pipeline(
            physics_context.narrow_phase.query_dispatcher(),
            &physics_context.rigid_body_set,
            &physics_context.collider_set,
            filter,
        );

        // Cast player shape along the desired translation
        if let Some((_handle, hit)) = query_pipeline.cast_shape(
            &self.movement.current_position,
            &cast_velocity,
            player_shape,
            ShapeCastOptions::with_max_time_of_impact(max_time_of_impact),
        ) {
            let surface_normal = hit.normal1;

            let allowed_distance =
                (hit.time_of_impact - (-hit.normal1.dot(&self.movement.desired_translation)) * self.config.loosened_offset).max(0.0);
            let allowed_translation = cast_velocity * allowed_distance;
            let remaining_translation = cast_velocity - allowed_translation;

            // Handle collision cases
            // 1. Steps and walls (anything steeper than the ground angle)
            if surface_normal.dot(&self.config.up.into_inner()) < self.config.ground_angle.to_radians().cos() {
                // Steps
                // Attempt cast the shape up and then forward from the collision point to see if we can step onto the obstacle
                let step_up_translation = Vector::new(0.0, self.config.autostep.max_height, 0.0);
                // Origin is up from the contact point
                let step_cast_origin = self.movement.current_position.translation.vector + allowed_translation + step_up_translation;
                // Velocity of the step cast is the minimum width of the step in the direction of the normal
                let step_cast_velocity = -surface_normal.into_inner() * self.config.autostep.min_width;

                if query_pipeline
                    .cast_shape(
                        &step_cast_origin.into(),
                        &step_cast_velocity,
                        player_shape,
                        ShapeCastOptions::with_max_time_of_impact(max_time_of_impact),
                    )
                    .is_none()
                // No collisions: Handle steps
                {
                    // Step up and forward
                    self.movement.current_position.translation.vector += step_up_translation + cast_velocity;
                }
                // Collision detected: Handle walls
                else {
                    // Project along wall
                    let projection_onto_normal = surface_normal.into_inner() * remaining_translation.dot(&surface_normal);

                    // Subtract this projection from the remaining translation to get the projection onto the plane
                    let projection_onto_plane = remaining_translation - projection_onto_normal;
                    self.movement.current_position.translation.vector += allowed_translation + projection_onto_plane;
                }
            }
            // 2. Slopes
            else if surface_normal.dot(&self.config.up.into_inner()) > self.config.ground_angle.to_radians().cos() {
                // Project along slope
                let projection_onto_normal = surface_normal.into_inner() * remaining_translation.dot(&surface_normal);

                // Subtract this projection from the remaining translation to get the projection onto the plane
                let projection_onto_plane = remaining_translation - projection_onto_normal;
                self.movement.current_position.translation.vector += allowed_translation + projection_onto_plane;
            }
        }
        // No collisions
        else {
            // Apply the cast as is (either the desired translation or the velocity * dt if in the air)
            self.movement.current_position.translation.vector += cast_velocity;
        }
    }

    /// Checks for any overlap of the player shape with the environment and reverses the overlap
    fn check_and_fix_overlaps(
        &mut self,
        _rigid_body_set: &RigidBodySet,
        _collider_set: &ColliderSet,
        _query_pipeline: &QueryPipeline,
        player_shape: &dyn Shape,
        player_pos: &Isometry<Real>,
        _filter: QueryFilter,
    ) {
        let contacts: Vec<(Contact, ColliderHandle)> = Vec::new();

        // Compute bounding box loosened by offset amount
        let _aabb = player_shape.compute_aabb(player_pos).loosened(self.config.loosened_offset);

        // TODO: update to new Rapier API
        // Query for intersecting colliders
        // query_pipeline.colliders_with_aabb_intersecting_aabb(&aabb, |collider_handle| {
        //     // Retrieve collider from handle
        //     if let Some(collider) = collider_set.get(*collider_handle) {
        //         // Apply query filters
        //         if filter.test(rigid_body_set, *collider_handle, collider) {
        //             // Retrieve contact information
        //             let contact = query::contact(&player_pos, player_shape, collider.position(), collider.shape(), 0.0);
        //             if let Ok(Some(contact)) = contact {
        //                 contacts.push((contact, *collider_handle));
        //             }
        //         }
        //     }

        //     true // keep iterating
        // });

        // Iterate over contacts
        for (contact, _collider_handle) in contacts {
            // The translation to fix the overlap is the overlap depth along the contact normal
            let overlap_inverse = contact.normal1.into_inner() * contact.dist;
            self.movement.current_position.translation.vector += overlap_inverse;
        }
    }

    fn calculate_translations(&mut self) {
        self.movement.movement = self.movement.current_position * self.movement.initial_position.inverse();
        self.movement.allowed_translation = self.movement.movement.translation.vector;
    }

    fn update_velocity(&mut self, dt: f32) {
        self.movement.velocity.x = self.movement.allowed_translation.x / dt;
        self.movement.velocity.z = self.movement.allowed_translation.z / dt;

        // Apply damping_xz to horizontal movement
        self.movement.velocity.x *= self.config.damping_xz;
        self.movement.velocity.z *= self.config.damping_xz;
    }
}
