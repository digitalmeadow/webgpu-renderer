// Based on the official Rapier3d example:
// Which iteself is based based on ray-casting, ported and modified from Projectile’s `btRaycastVehicle`.
// https://github.com/dimforge/rapier/blob/master/src/control/ray_cast_vehicle_controller.rs

use engine_maths::{
    UnitVector3, Vector3,
    interpolation::{invert, lerp_value, rate_independent_lerping_factor},
};
use rapier3d::{
    math::{Point, Real, Rotation, UnitVector, Vector},
    prelude::{ColliderHandle, ColliderSet, QueryFilter, Ray, RigidBody, RigidBodyHandle, RigidBodySet},
};

use crate::{PhysicsContext, errors::EnginePhysicsError};

pub struct VehicleControllerDesc {
    pub forward_engine_force: Real,
    pub reverse_engine_force: Real,
    pub braking_force: Real,
    pub speed_limiter: Real,
    pub downforce: Real,
}

impl Default for VehicleControllerDesc {
    fn default() -> Self {
        Self {
            forward_engine_force: 250.0,
            reverse_engine_force: 250.0,
            braking_force: 650.0,
            speed_limiter: 10.0,
            downforce: 50.0,
        }
    }
}

/// A character controller to simulate vehicles using ray-casting for the wheels
pub struct VehicleController {
    /// Handle of the vehicle’s body
    pub body_rigid_body_handle: RigidBodyHandle,
    pub body_collider_handle: ColliderHandle,

    /// Wheels attached to this vehicle
    pub wheels: Vec<Wheel>,

    /// Local axis
    pub up_axis: UnitVector<Real>,
    pub forward_axis: UnitVector<Real>,
    pub side_axis: UnitVector<Real>,

    /// Current desc values
    pub forward_engine_force: Real,
    pub reverse_engine_force: Real,
    pub braking_force: Real,
    pub speed_limiter: Real,
    pub downforce: Real,

    /// Store the initial desc for resetting the vehicle
    pub initial_desc: VehicleControllerDesc,

    /// Current forward speed of the vehicle
    pub current_vehicle_speed: Real,
    /// Current average steering angle of all wheels
    pub current_steering_angle: Real,
    /// Track acceleration manually since Rapier doesn't do it
    previous_linear_velocity: Vector3<Real>,
    previous_angular_velocity: Vector3<Real>,
    pub linear_acceleration: Vector3<Real>,
    pub angular_acceleration: Vector3<Real>,

    /// Number of wheels currently touching the ground
    pub current_num_wheels_on_ground: usize,
}

#[derive(Copy, Clone, Debug, PartialEq)]
/// Parameters affecting the physical behavior of a wheel
pub struct WheelTuning {
    /// Factor diminishing the engine force on a free spinning wheel, essentially an inertia factor
    pub free_spin_factor: Real,
    /// Rate at which the wheel’s rotation slows down when not in contact with the ground
    pub free_spin_damping: Real,
    /// Suspension stiffness
    /// Increase this value if the suspension appears to not push the vehicle strong enough
    pub suspension_stiffness: Real,
    /// Suspension’s damping when it is being compressed
    pub suspension_compression_damping: Real,
    /// Suspension’s damping when it is being released
    /// Increase this value if the suspension appears to overshoot
    pub suspension_rebound_damping: Real,
    /// Maximum force applied by the suspension
    pub suspension_max_force: Real,
    /// Maximum distance the suspension can travel before and after its resting length
    /// Needs to be greater than the radius to enable movement
    pub suspension_max_extension: Real,
    /// Multiplier of this wheel's calculated sideways impulse
    pub side_friction_stiffness: Real,
    /// Parameter controlling how much traction the tire has
    /// The larger the value, the more instantaneous braking will happen
    /// Vehicle will flip when braking if this value is too high
    pub friction_slip: Real,
    /// Parameter defining the powf skid curve shape of the wheel
    /// The larger the value, the higher the skid factor at lower slip values
    pub skid_curve: Real,
    /// Parameter defining the skid curve scale of the wheel
    /// This scales the difference of the slip value and the max slip value
    /// The larger the value, the steeper the skid curve
    pub skid_curve_scale: Real,
    /// Parameter defining the consistent forwards impulse of a wheel
    /// The lower the value the more forwards direction a wheel supplies regardless of skid_factor
    pub forward_slip_reduction_factor: Real,
    pub side_slip_reduction_factor: Real,
    /// Parameter defining the default minimum for skid_factor
    pub skid_factor_minimum: Real,
    /// Paramter defining the ratio balance between forward and side forces when calculating the sliding force
    /// 1 = realistic, 4 = maintains more control of the vehicle
    pub forward_side_ratio_factor: Real,
}

impl Default for WheelTuning {
    fn default() -> Self {
        Self {
            free_spin_factor: 0.02,
            free_spin_damping: 0.99,
            // suspension_stiffness: 30.0,
            suspension_stiffness: 40.0,
            // suspension_compression_damping: 1.5,
            suspension_compression_damping: 1.5,
            suspension_rebound_damping: 1.1,
            suspension_max_force: 99999.0,
            suspension_max_extension: 1.0,
            side_friction_stiffness: 1.0,
            friction_slip: 1.0,
            skid_curve: 0.4,
            skid_curve_scale: 2.0,
            forward_slip_reduction_factor: 0.15,
            side_slip_reduction_factor: 1.0,
            skid_factor_minimum: 0.0,
            forward_side_ratio_factor: 1.0,
        }
    }
}

/// Objects used to initialize a wheel
pub struct WheelDesc {
    /// Used as ID
    pub index: usize,
    /// Should this wheel drive the engine
    pub drives: bool,
    /// Should this wheel be steered
    pub steers: bool,
    /// Should this wheel be braked
    pub brakes: bool,
    /// Position of the wheel, relative to the body
    pub body_connection_bs: Point<Real>,
    /// Absolute axle axis, relative to the body
    pub axle_direction_bs: UnitVector<Real>,
    pub axle_negative: bool,
    /// Direction of the wheel’s suspension, relative to the body
    /// The ray-casting will happen following this direction to detect the ground
    pub suspension_direction_bs: UnitVector<Real>,
    /// Rest length of the wheel’s suspension spring
    pub suspension_rest_length: Real,
    /// Wheel radius
    pub radius: Real,
    /// Wheel tuning parameters
    pub tuning: WheelTuning,
}

#[derive(Copy, Clone, Debug, PartialEq)]
/// A wheel attached to a vehicle
pub struct Wheel {
    /// Parent body of wheel
    pub body_rigid_body_handle: Option<RigidBodyHandle>,
    pub index: usize,

    pub raycast_info: RayCastInfo,

    // Capabilities
    pub drives: bool,
    pub steers: bool,
    pub brakes: bool,

    // Properties
    pub forward_direction_ws: UnitVector<Real>,
    pub suspension_direction_ws: UnitVector<Real>,
    pub axle_direction_ws: UnitVector<Real>,
    pub center_ws: Point<Real>,
    pub center_bs: Point<Real>,

    /// Rotation
    pub rotation: Real,
    pub delta_rotation: Real,
    /// Signed difference between wheel rotation and the contact surface
    pub rotation_surface_delta: Real,

    /// Factor of how likely this wheel is to roll the body when steering
    body_roll_influence: Real,

    /// Forward impulses applied by the wheel on the body
    pub forward_impulse: Real,
    /// Side impulses applied by the wheel on the body
    pub side_impulse: Real,
    /// Steering angle for this wheel
    pub steering_angle: Real,
    /// Forward force applied by this wheel on the body
    pub engine_force: Real,
    /// Maximum amount of braking impulse applied to slow down the vehicle
    pub braking_force: Real,
    /// Force applied by the suspension
    pub suspension_force: Real,

    /// A useful positive scaling factor that is derived from the alignment of the suspension direction and the ground
    normal_alignment_factor: Real,
    suspension_relative_velocity: Real,
    pub skid_factor: Real,

    /// Desc
    /// Position of the wheel, relative to the body
    pub body_connection_point_bs: Point<Real>,
    /// Wheel’s axle axis, relative to the body
    pub axle_direction_bs: UnitVector<Real>,
    /// Helper for vector calculations
    /// Saves on having to calculate which wheels are on the negative side of the body forward direction
    pub axle_negative: bool,
    /// Direction of the wheel’s suspension, relative to the body
    /// The ray-casting will happen following this direction to detect the ground
    pub suspension_direction_bs: UnitVector<Real>,
    /// Rest length of the wheel’s suspension spring
    pub suspension_rest_length: Real,
    /// Wheel’s radius
    pub radius: Real,

    /// Tuning parameters
    pub tuning: WheelTuning,
}

impl Wheel {
    pub fn new(wheel_desc: WheelDesc) -> Self {
        Self {
            body_rigid_body_handle: None,
            index: wheel_desc.index,

            drives: wheel_desc.drives,
            steers: wheel_desc.steers,
            brakes: wheel_desc.brakes,

            axle_direction_ws: wheel_desc.axle_direction_bs,
            suspension_direction_ws: wheel_desc.suspension_direction_bs,

            // This group of variables will be updated prior to the first raycast
            raycast_info: RayCastInfo::new(wheel_desc.suspension_rest_length),
            forward_direction_ws: UnitVector::new_normalize(Vector::zeros()),

            center_ws: Point::origin(),
            center_bs: wheel_desc.body_connection_bs,

            rotation: 0.0,
            delta_rotation: 0.0,
            rotation_surface_delta: 0.0,

            body_roll_influence: 0.15,

            forward_impulse: 0.0,
            side_impulse: 0.0,
            steering_angle: 0.0,
            engine_force: 0.0,
            braking_force: 0.0,
            suspension_force: 0.0,

            normal_alignment_factor: 0.0,
            suspension_relative_velocity: 0.0,
            skid_factor: 0.0,

            body_connection_point_bs: wheel_desc.body_connection_bs,
            axle_direction_bs: wheel_desc.axle_direction_bs,
            axle_negative: wheel_desc.axle_negative,
            suspension_direction_bs: wheel_desc.suspension_direction_bs,
            suspension_rest_length: wheel_desc.suspension_rest_length,
            radius: wheel_desc.radius,

            tuning: wheel_desc.tuning,
        }
    }
}

/// Information about suspension and the ground obtained from the ray-casting
/// to simulate a wheel’s suspension
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct RayCastInfo {
    /// World-space starting point of the ray-cast
    pub origin_point_ws: Point<Real>,
    /// World-space point hit by the wheel’s ray-cast
    pub contact_point_ws: Point<Real>,
    /// World-space contact normal between the wheel and the ground
    pub contact_normal_ws: Vector<Real>,

    /// Collider hit by the ray-cast
    pub surface_collider_handle: Option<ColliderHandle>,

    /// Suspension length for the wheel
    pub suspension_length: Real,
    /// Is the wheel in contact with the ground
    pub is_in_contact: bool,
}

impl RayCastInfo {
    pub fn new(suspension_rest_length: Real) -> Self {
        Self {
            origin_point_ws: Point::origin(),
            contact_point_ws: Point::origin(),
            contact_normal_ws: Vector::zeros(),

            surface_collider_handle: None,

            suspension_length: suspension_rest_length,
            is_in_contact: false,
        }
    }
}

impl VehicleController {
    /// Creates a new vehicle represented by the given rigid-body
    /// Wheels have to be attached afterwards calling [`Self::add_wheel`]
    pub fn new(
        body_rigid_body_handle: RigidBodyHandle,
        body_collider_handle: ColliderHandle,
        vehicle_controller_desc: VehicleControllerDesc,
        forward_axis: UnitVector3<f32>,
        side_axis: UnitVector3<f32>,
    ) -> Self {
        Self {
            body_rigid_body_handle,
            body_collider_handle,
            wheels: Vec::new(),

            up_axis: UnitVector::new_normalize(Vector::y_axis().into_inner()),
            forward_axis,
            side_axis,
            forward_engine_force: vehicle_controller_desc.forward_engine_force,
            reverse_engine_force: vehicle_controller_desc.reverse_engine_force,
            braking_force: vehicle_controller_desc.braking_force,
            speed_limiter: vehicle_controller_desc.speed_limiter,
            downforce: vehicle_controller_desc.downforce,

            initial_desc: vehicle_controller_desc,

            current_vehicle_speed: 0.0,
            current_steering_angle: 0.0,
            previous_linear_velocity: Vector3::zeros(),
            previous_angular_velocity: Vector3::zeros(),
            linear_acceleration: Vector3::zeros(),
            angular_acceleration: Vector3::zeros(),

            current_num_wheels_on_ground: 0,
        }
    }

    /// Adds a wheel to this vehicle
    pub fn add_wheel(&mut self, wheel: Wheel) {
        self.wheels.push(wheel);
    }

    /// Mutable reference to all the wheels attached to this vehicle
    pub fn wheels_mut(&mut self) -> &mut [Wheel] {
        &mut self.wheels
    }

    /// Main update loop: updates vehicle’s velocity per frame based on its suspension, engine force, and braking_force
    pub fn update_vehicle(
        &mut self,
        dt: Real,
        physics_context: &mut PhysicsContext,
        query_filter: QueryFilter,
    ) -> Result<(), EnginePhysicsError> {
        // Reset the variables
        self.current_num_wheels_on_ground = 0;

        // Calculate signed speed of the vehicle
        self.calculate_vehicle_speed(&mut physics_context.rigid_body_set);

        // Calculate acceleration forces
        self.calculate_vehicle_acceleration(&mut physics_context.rigid_body_set, dt);

        // Update wheel transforms
        for i in 0..self.wheels.len() {
            self.update_wheel_transform(&mut physics_context.rigid_body_set, i);
        }

        for wheel_id in 0..self.wheels.len() {
            self.ray_cast_wheel(physics_context, wheel_id, &query_filter);
        }

        // Apply drag to the vehicle
        self.apply_drag(&mut physics_context.rigid_body_set);
        self.apply_downforce(&mut physics_context.rigid_body_set, dt);

        // Calculate suspension forces for each wheel
        self.prepare_wheels_suspension_forces(&mut physics_context.rigid_body_set);

        // Apply suspension forces
        self.apply_wheels_suspension_forces(&mut physics_context.rigid_body_set, dt);

        // Update passive wheels friction forces (prior to rotation)
        self.update_wheels_friction_forces(&mut physics_context.rigid_body_set, &physics_context.collider_set, dt);

        // Update wheel linear transforms
        self.update_wheels_suspension_transform();

        // Update wheel axial rotation
        self.update_wheels_axial_rotation(&mut physics_context.rigid_body_set, dt);
        self.calculate_steering_angle();

        // Update friction
        self.apply_wheels_friction_forces(&mut physics_context.rigid_body_set)?;

        Ok(())
    }

    fn calculate_vehicle_speed(&mut self, bodies: &mut RigidBodySet) {
        let body = &mut bodies[self.body_rigid_body_handle];

        // Calculate the vehicle speed
        self.current_vehicle_speed = body.linvel().norm();

        // Invert the speed if the vehicle is going backwards
        let forward_ws = body.position() * self.forward_axis;

        if forward_ws.dot(body.linvel()) < 0.0 {
            self.current_vehicle_speed *= -1.0;
        }
    }

    fn calculate_vehicle_acceleration(&mut self, bodies: &mut RigidBodySet, dt: Real) {
        let body = &mut bodies[self.body_rigid_body_handle];

        // Get the current velocities
        let current_linear_velocity = body.linvel().clone();
        let current_angular_velocity = body.angvel().clone();

        // Calculate accelerations (change in velocity over time)
        self.linear_acceleration = (current_linear_velocity - self.previous_linear_velocity) / dt;
        self.angular_acceleration = (current_angular_velocity - self.previous_angular_velocity) / dt;

        // Store current velocities for next frame
        self.previous_linear_velocity = current_linear_velocity;
        self.previous_angular_velocity = current_angular_velocity;
    }

    /// Update wheel transforms based on the body position and steering angle
    fn update_wheel_transform(&mut self, bodies: &mut RigidBodySet, wheel_index: usize) {
        let body = &mut bodies[self.body_rigid_body_handle];
        let wheel = &mut self.wheels[wheel_index];

        // Reset states at start of calculation
        wheel.raycast_info.is_in_contact = false;

        // Apply the world-space position of the body to the wheel's world-space variables
        let body_transform_ws = body.position();

        wheel.raycast_info.origin_point_ws = body_transform_ws * wheel.body_connection_point_bs;
        wheel.suspension_direction_ws = body_transform_ws * wheel.suspension_direction_bs;
        wheel.axle_direction_ws = body_transform_ws * wheel.axle_direction_bs;

        // Apply the steering angle
        let steering_orientation = Rotation::new(-wheel.suspension_direction_ws.into_inner() * wheel.steering_angle);
        let axle_direction_ws = body.position() * wheel.axle_direction_bs;
        wheel.axle_direction_ws = steering_orientation * axle_direction_ws;
    }

    /// Ray cast to detect the ground and apply suspension and engine physics accordingly
    fn ray_cast_wheel(&mut self, physics_context: &mut PhysicsContext, wheel_id: usize, query_filter: &QueryFilter) {
        let wheel = &mut self.wheels[wheel_id];

        // Ray params
        let ray_length = wheel.tuning.suspension_max_extension;
        let ray_direction = wheel.suspension_direction_ws.into_inner();
        let ray_origin = wheel.raycast_info.origin_point_ws;

        // Define and cast ray
        let query_pipeline = physics_context.broad_phase.as_query_pipeline(
            physics_context.narrow_phase.query_dispatcher(),
            &physics_context.rigid_body_set,
            &physics_context.collider_set,
            *query_filter,
        );

        let ray = Ray::new(ray_origin, ray_direction);
        // Exclude the body from the raycast
        let hit = query_pipeline.cast_ray_and_get_normal(&ray, ray_length, false);

        // Reset ratcast info
        wheel.raycast_info.surface_collider_handle = None;

        if let Some((collider_hit, hit)) = hit {
            let body = &mut physics_context.rigid_body_set[self.body_rigid_body_handle];

            // Handle standard case where we hit the ground
            wheel.raycast_info.contact_normal_ws = hit.normal;
            wheel.raycast_info.is_in_contact = true;
            wheel.raycast_info.surface_collider_handle = Some(collider_hit);

            // Increment the number of wheels on the ground
            self.current_num_wheels_on_ground += 1;

            // Calculate suspension length
            let hit_distance = hit.time_of_impact;
            wheel.raycast_info.suspension_length = hit_distance;

            wheel.raycast_info.contact_point_ws = ray.point_at(hit_distance);

            let normal_alignment = wheel.raycast_info.contact_normal_ws.dot(&wheel.suspension_direction_ws); // Alignment between the ground normal and the suspension direction (-1 = aligned)
            let body_velocity_at_contact_point = body.velocity_at_point(&wheel.raycast_info.contact_point_ws);
            let body_velocity_along_normal = wheel.raycast_info.contact_normal_ws.dot(&body_velocity_at_contact_point); // Component of the body velocity acting along the contact normal

            // Handle perpendicular case to prevent division by a small number
            if normal_alignment >= -0.1 {
                wheel.suspension_relative_velocity = 0.0;
                wheel.normal_alignment_factor = 1.0 / 0.1;
            } else {
                // Otherwise set the alignment factor to the inverse of the alignment to get a useful positive scaling factor
                let inverse_normal_alignment = -1.0 / normal_alignment; // (1 = aligned)
                wheel.normal_alignment_factor = inverse_normal_alignment;

                // Calculate the relative velocity of the body along the vertical suspension axis
                wheel.suspension_relative_velocity = body_velocity_along_normal * wheel.normal_alignment_factor;
            }
        }
    }

    /// Apply a drag coefficient force to the vehicle, limiting it's top speed
    fn apply_drag(&mut self, bodies: &mut RigidBodySet) {
        // Immutatable reference to the body
        let body = &mut bodies[self.body_rigid_body_handle];
        let damping_drag = 1.0 - invert((self.current_vehicle_speed / self.speed_limiter).max(1.0));
        body.set_linear_damping(damping_drag);
    }

    /// Apply a downwards force to the vehicle, improving steering control during acceleration
    fn apply_downforce(&mut self, bodies: &mut RigidBodySet, dt: f32) {
        // Immutatable reference to the body
        let body = &mut bodies[self.body_rigid_body_handle];

        // Map downforce to current vehicle velocity (only if 3 or more wheels are in contact)
        let downforce_amplitude = if self.current_num_wheels_on_ground >= 3 {
            self.current_vehicle_speed.abs() * self.downforce
        } else {
            0.0
        };

        let body_up_axis_ws = body.position().rotation * self.up_axis.into_inner();
        let downforce_impulse = body_up_axis_ws * -downforce_amplitude * dt;
        body.apply_impulse(downforce_impulse, true);
    }

    /// Calculate suspension forces for each wheel
    fn prepare_wheels_suspension_forces(&mut self, bodies: &mut RigidBodySet) {
        let body = &mut bodies[self.body_rigid_body_handle];
        let body_mass = body.mass();

        for wheel in self.wheels_mut() {
            if wheel.raycast_info.is_in_contact {
                let mut force;

                //	Calculate spring force
                let rest_length = wheel.suspension_rest_length;
                let current_length = wheel.raycast_info.suspension_length;

                // +ve means compressed, -ve means extended
                let length_difference = (rest_length - current_length) + wheel.radius;

                // Force is proportional to how much the spring is compressed and how aligned the suspension is with the ground
                force = wheel.tuning.suspension_stiffness * length_difference * wheel.normal_alignment_factor;

                if force <= 0.0 {
                    continue;
                }

                // Damping
                // For damping, use the relative velocity to determine if we are compressing or extending the suspension
                let damping = if wheel.suspension_relative_velocity < 0.0 {
                    wheel.tuning.suspension_compression_damping
                } else {
                    wheel.tuning.suspension_rebound_damping
                };

                // Force is affected by the suspension's relative velocity and damping
                force -= damping * wheel.suspension_relative_velocity;

                // Factor in the mass of the body and clamp
                wheel.suspension_force = (force * body_mass).max(0.0);
            } else {
                // No contact with the ground so no suspension force is applied
                wheel.suspension_force = 0.0;
            }
        }
    }

    /// Applies the calculated and clamped suspension forces to the body
    fn apply_wheels_suspension_forces(&mut self, bodies: &mut RigidBodySet, dt: Real) {
        let body = &mut bodies[self.body_rigid_body_handle];

        // Apply suspension forces from each wheel
        for wheel in &mut self.wheels {
            // Clamp and apply suspension force
            let suspension_force = wheel.suspension_force.min(wheel.tuning.suspension_max_force);

            // Calculate the impulse to apply to the body
            let impulse = wheel.raycast_info.contact_normal_ws * suspension_force * dt;
            body.apply_impulse_at_point(impulse, wheel.raycast_info.contact_point_ws, false);
        }
    }

    /// Update friction forces for passive wheels
    fn update_wheels_friction_forces(&mut self, bodies: &mut RigidBodySet, colliders: &ColliderSet, dt: Real) {
        for wheel in &mut self.wheels {
            let surface_collider_handle = wheel.raycast_info.surface_collider_handle;

            wheel.skid_factor = 0.0;
            wheel.side_impulse = 0.0;
            wheel.forward_impulse = 0.0;

            if surface_collider_handle.is_some() {
                // let axle_direction_ws = wheel.axle_direction_ws.into_inner();
                let contact_normal_ws = wheel.raycast_info.contact_normal_ws;

                // Calculate this wheels forward direction
                wheel.forward_direction_ws = if wheel.axle_negative {
                    UnitVector::new_normalize(contact_normal_ws.cross(&wheel.axle_direction_ws))
                } else {
                    UnitVector::new_normalize(contact_normal_ws.cross(&-wheel.axle_direction_ws))
                };

                // Calculate forward and braking forces
                let rolling_friction_impulse;

                if wheel.engine_force != 0.0 && wheel.braking_force == 0.0 {
                    // If engine force is applied, calculate the rolling friction
                    rolling_friction_impulse = wheel.engine_force * dt;
                } else {
                    // If coasting or braking, calculate the rolling friction
                    let default_rolling_friction_impulse = 0.0;

                    // If braking force is applied, use the braking force as the max impulse
                    let max_impulse = if wheel.braking_force != 0.0 {
                        wheel.braking_force * dt
                    } else {
                        default_rolling_friction_impulse
                    };

                    // Construct a new contact point struct
                    let wheel_contact_point = WheelContactPoint::new(
                        &bodies[self.body_rigid_body_handle],
                        surface_collider_handle
                            .and_then(|collider_handle| colliders[collider_handle].parent())
                            .map(|rigid_body_handle| &bodies[rigid_body_handle]),
                        wheel.raycast_info.contact_point_ws,
                        wheel.forward_direction_ws.into_inner(),
                        max_impulse,
                    );

                    // Use the rolling friction calculated at the contact point
                    rolling_friction_impulse = wheel_contact_point.calculate_rolling_friction(self.current_num_wheels_on_ground);
                }

                // Forward impulse is simply the rolling friction
                wheel.forward_impulse = rolling_friction_impulse;

                // Check for dynamic ground
                let ground_body_is_dynamic = surface_collider_handle
                    .and_then(|collider_handle| colliders[collider_handle].parent())
                    .map(|rigid_body_handle| &bodies[rigid_body_handle])
                    .filter(|rigid_body| rigid_body.is_dynamic() || rigid_body.is_kinematic());

                // Calculate side impulses
                if let Some(ground_body) = ground_body_is_dynamic {
                    // If the ground object is dynamic, apply a bilateral constraint to the wheel
                    wheel.side_impulse = resolve_single_bilateral(
                        &bodies[self.body_rigid_body_handle],
                        &wheel.raycast_info.contact_point_ws,
                        ground_body,
                        &wheel.raycast_info.contact_point_ws,
                        &wheel.axle_direction_ws,
                    );
                } else {
                    // If the ground object is static, apply a unilateral constraint to the wheel
                    wheel.side_impulse = resolve_single_unilateral(
                        &bodies[self.body_rigid_body_handle],
                        &wheel.raycast_info.contact_point_ws,
                        &wheel.axle_direction_ws,
                    );
                }

                // Scale side impulse by the side friction stiffness factor
                wheel.side_impulse *= wheel.tuning.side_friction_stiffness;

                // A wheel that is barely touching the ground should have a lower max impulse
                let suspension_impulse = wheel.suspension_force * dt;
                // Calculate the max impulse based on the wheel tuning and suspension impulse
                let max_impulse = suspension_impulse * wheel.tuning.friction_slip;

                let total_impulse = (wheel.forward_impulse.abs() * wheel.tuning.forward_side_ratio_factor)
                    + (wheel.side_impulse.abs() * 1.0 / wheel.tuning.forward_side_ratio_factor);

                // If the impulse is greater than the max impulse, the wheel is sliding
                if total_impulse > max_impulse {
                    let x = total_impulse / max_impulse;
                    let k = wheel.tuning.skid_curve;
                    let s = wheel.tuning.skid_curve_scale;

                    let skid_factor = 1.0 - (1.0 + s * (x - 1.0)).powf(-k);

                    wheel.skid_factor = skid_factor.clamp(0.0, 1.0).max(wheel.tuning.skid_factor_minimum);
                } else {
                    wheel.skid_factor = 0.0;
                }

                // When sliding, we still want to retain (or even boost) some forward traction
                // Standard behaviour: We make this based on the current vehicle speed so that stationary wheel spins are possible, but also speed-through-slides
                // let body = &bodies[self.body_rigid_body_handle];
                // let body_forward_velocity_at_contact_point = body
                //     .velocity_at_point(&wheel.raycast_info.contact_point_ws)
                //     .dot(&wheel.forward_direction_ws.into_inner());

                // let forward_slip_reduction_factor = invert(body_forward_velocity_at_contact_point.abs().sqrt().max(0.8));

                // Topdown behaviour: we want to always maintain forward/backward control
                // The only issue when this is 0 is that when stopped on a slope, the car will slide sideways but not forward or back which is not ideal

                // This simulates a slide by reducing the impulses by the factor of the skid info
                if wheel.skid_factor > 0.0 {
                    // Scale the impulses by the skid_factor
                    // wheel.side_impulse = wheel.side_impulse * (1.0 - wheel.skid_factor);
                    wheel.side_impulse = wheel.side_impulse * (1.0 - (wheel.skid_factor * wheel.tuning.side_slip_reduction_factor));

                    wheel.forward_impulse =
                        wheel.forward_impulse * (1.0 - (wheel.skid_factor * wheel.tuning.forward_slip_reduction_factor));
                }
            }
        }
    }

    /// Update the linear transforms of the wheels based on the suspension state
    pub fn update_wheels_suspension_transform(&mut self) {
        for wheel in &mut self.wheels {
            wheel.center_ws = wheel.raycast_info.origin_point_ws
                + wheel.suspension_direction_ws.into_inner() * (wheel.raycast_info.suspension_length - wheel.radius);
            wheel.center_bs = wheel.body_connection_point_bs
                + wheel.suspension_direction_bs.into_inner() * (wheel.raycast_info.suspension_length - wheel.radius);
        }
    }

    /// Update the axial rotation of the wheels based on the body velocity and ground contact state
    fn update_wheels_axial_rotation(&mut self, bodies: &mut RigidBodySet, dt: Real) {
        let body = &bodies[self.body_rigid_body_handle];

        for wheel in &mut self.wheels {
            let body_velocity_at_contact_point = body.velocity_at_point(&wheel.raycast_info.contact_point_ws);

            // Handbrake instantly stops the wheel rotation
            if wheel.brakes && wheel.braking_force > 0.0 {
                wheel.delta_rotation = 0.0;
                return;
            }

            if wheel.raycast_info.is_in_contact {
                // Handle grounded case: roll the wheel along the ground
                // Component of body velocity that is moving along the same direction as the wheel
                let body_velocity_along_wheel = body_velocity_at_contact_point.dot(&wheel.forward_direction_ws);

                // Calculate the wheel's rotation angle
                let mut angular_displacement = (body_velocity_along_wheel * dt) / (wheel.radius);
                let rotation_surface_delta_base = angular_displacement;

                // If wheels are sliding, we can factor the engine force into the rotation
                if wheel.skid_factor > 0.0 {
                    // Factor in the engine force
                    let engine_force_angular_acceleration = wheel.engine_force / wheel.radius;
                    let engine_force_angular_velocity = engine_force_angular_acceleration * dt; // Integrate acceleration to get velocity
                    let engine_force_angular_displacement = engine_force_angular_velocity * dt;

                    angular_displacement += engine_force_angular_displacement * wheel.skid_factor;
                    wheel.delta_rotation = angular_displacement;
                } else {
                    wheel.delta_rotation = angular_displacement;
                }

                wheel.rotation -= wheel.delta_rotation;
                wheel.rotation_surface_delta = rotation_surface_delta_base - wheel.delta_rotation;
            } else {
                // Handle non-grounded: spin the wheel and apply free-spin damping
                let angular_acceleration = wheel.engine_force / wheel.radius;
                let angular_velocity = angular_acceleration * dt; // Integrate acceleration to get velocity
                let angular_displacement = angular_velocity * dt;

                // Apply free-spin factor
                wheel.delta_rotation += angular_displacement * wheel.tuning.free_spin_factor;

                if wheel.engine_force == 0.0 {
                    // Apply free-spin damping
                    let lerping_factor = rate_independent_lerping_factor(wheel.tuning.free_spin_damping, dt);
                    wheel.delta_rotation = lerp_value(wheel.delta_rotation, 0.0, lerping_factor);
                }

                wheel.rotation -= wheel.delta_rotation;
                // No surface, so no surface delta
                wheel.rotation_surface_delta = 0.0;
            }
        }
    }

    /// Calculate the average steering angle of vehicle
    fn calculate_steering_angle(&mut self) {
        let mut steering_angle = 0.0;

        for wheel in self.wheels.iter() {
            steering_angle += wheel.steering_angle;
        }

        steering_angle /= self.wheels.len() as f32;

        self.current_steering_angle = steering_angle;
    }

    fn apply_wheels_friction_forces(&mut self, bodies: &mut RigidBodySet) -> Result<(), EnginePhysicsError> {
        let body = bodies
            .get_mut(self.body_rigid_body_handle)
            .ok_or(EnginePhysicsError::RigidBodyNotFound())?;

        // Apply forward and side impulses
        for wheel in &mut self.wheels {
            // Apply forward impulse
            if wheel.forward_impulse != 0.0 {
                // Give the forward impulse a direction
                let forward_impulse_vector = wheel.forward_impulse * wheel.forward_direction_ws.into_inner();

                // Forward impulse is applied at the contact point (not the axle.. physics can be weird)
                let forward_impulse_point = wheel.raycast_info.contact_point_ws;
                body.apply_impulse_at_point(forward_impulse_vector, forward_impulse_point, false);
            }

            // Apply side impulse
            if wheel.side_impulse != 0.0 {
                let side_impulse_vector = wheel.side_impulse * wheel.axle_direction_ws.into_inner();

                // Side impulse is applied at the contact point adjusted vertically by the roll influence
                let body_up_axis_ws = body.position().rotation * self.up_axis.into_inner();

                // Start with the difference between the contact point and the center of mass
                let mut side_impulse_point_offset = wheel.raycast_info.contact_point_ws - body.center_of_mass();

                // Project the difference onto the up axis so we're only dealing with the vertical component
                side_impulse_point_offset = body_up_axis_ws * body_up_axis_ws.dot(&(side_impulse_point_offset));

                // Scale the vertical offset by the roll influence
                side_impulse_point_offset = side_impulse_point_offset * (1.0 - wheel.body_roll_influence);

                // Calculate the final impulse point using the offset
                let side_impulse_point = wheel.raycast_info.contact_point_ws - side_impulse_point_offset;

                body.apply_impulse_at_point(side_impulse_vector, side_impulse_point, false);
            }
        }

        Ok(())
    }
}

struct WheelContactPoint<'a> {
    body_rigid_body: &'a RigidBody,
    contact_surface_rigid_body: Option<&'a RigidBody>,
    friction_position_ws: Point<Real>,
    friction_direction_ws: Vector<Real>,
    jacobian_diagonal_ab_inverse: Real,
    max_impulse: Real,
}

impl<'a> WheelContactPoint<'a> {
    pub fn new(
        body_rigid_body: &'a RigidBody,
        contact_surface_rigid_body: Option<&'a RigidBody>,
        friction_position_ws: Point<Real>,
        friction_direction_ws: Vector<Real>,
        max_impulse: Real,
    ) -> Self {
        // Helper function to calculate the impulse denominator for a given body, position, and direction
        // Impulse denomators are used to normalize the impulses applied to the bodies by taking their mass and inertia into account
        fn impulse_denominator(body: &RigidBody, impulse_position: &Point<Real>, impulse_direction: &Vector<Real>) -> Real {
            let impulse_position_delta = impulse_position - body.center_of_mass();

            // Calculate the cross product of the vector and the direction
            let lever_arm = impulse_position_delta.cross(impulse_direction);

            // Calculate the effective inertia tensor transformation of the lever arm vector
            let transformed_lever_arm =
                body.mass_properties().effective_world_inv_inertia * (body.mass_properties().effective_world_inv_inertia * lever_arm);

            // Calculate the cross product of the transformed lever arm and the radius vector
            let effective_interia = transformed_lever_arm.cross(&impulse_position_delta);

            // Return the sum of the inverse mass and the dot product of the impulse direction and the rotational effect vector
            body.mass_properties().local_mprops.inv_mass + impulse_direction.dot(&effective_interia)
        }

        // Calculate the impulse denominator for the body rigid body
        let body_impulse_denominator = impulse_denominator(body_rigid_body, &friction_position_ws, &friction_direction_ws);

        // Calculate the impulse denominator for the contat rigid body, if it exists
        let contact_surface_impulse_denominator = contact_surface_rigid_body
            .map(|contact_surface_rigid_body| {
                impulse_denominator(contact_surface_rigid_body, &friction_position_ws, &friction_direction_ws)
            })
            .unwrap_or(0.0);

        let impulse_denominator_sum = body_impulse_denominator + contact_surface_impulse_denominator;

        // Calculate the inverse of the Jacobian diagonal element for the constraint
        let jacobian_diagonal_ab_inverse = invert(impulse_denominator_sum);

        Self {
            body_rigid_body,
            contact_surface_rigid_body,
            friction_position_ws,
            friction_direction_ws,
            jacobian_diagonal_ab_inverse,
            max_impulse,
        }
    }

    /// Calculate the rolling friction for the wheel
    pub fn calculate_rolling_friction(&self, num_wheels_on_ground: usize) -> Real {
        let body_velocity = self.body_rigid_body.velocity_at_point(&self.friction_position_ws);
        let contact_surface_velocity = self
            .contact_surface_rigid_body
            .map(|b| b.velocity_at_point(&self.friction_position_ws))
            .unwrap_or_else(Vector::zeros);

        let contact_surface_velocity_delta = body_velocity - contact_surface_velocity;
        let contact_surface_aligned_relative_velocity = self.friction_direction_ws.dot(&contact_surface_velocity_delta);

        // Calculate the negative impulse needed to bring the contact surfaces relative velocity to zero
        let impulse = -contact_surface_aligned_relative_velocity * self.jacobian_diagonal_ab_inverse;

        // Distribute the impulse evenly among all wheels in contact with the ground
        let distributed_impulse = impulse / (num_wheels_on_ground as Real);

        // Clamp the impulse to ensure it does not exceed the maximum allowable impulse
        let clamped_impulse = distributed_impulse.clamp(-self.max_impulse, self.max_impulse);

        clamped_impulse
    }
}

// Adjust this value down from 1.0 only until stationary jittering and movement is smooth
// Too low, and the vehicle will just slide around (nice for drifting but that's supposed to be handled elsewhere)
const LATERAL_SMOOTHING: f32 = 0.4;

/// General function to resolve a unilateral constraint between two bodies
fn resolve_single_unilateral(body1: &RigidBody, point1: &Point<Real>, normal: &Vector<Real>) -> Real {
    let velocity1 = body1.velocity_at_point(point1);
    let velocity_delta = velocity1; // Single body hence delta = velocity

    let position_delta = point1 - body1.center_of_mass();
    let jacobian = position_delta.cross(normal);
    let inverse_jacobian = body1.mass_properties().effective_world_inv_inertia * jacobian;

    let inverse_mass1 = body1.mass_properties().local_mprops.inv_mass;
    let jacobian_diagonal_ab = inverse_mass1 + inverse_jacobian.dot(&inverse_jacobian);
    let jacobian_diagonal_ab_inverse = invert(jacobian_diagonal_ab);
    let relative_velocity = normal.dot(&velocity_delta);

    let contact_damping = LATERAL_SMOOTHING;
    let unilateral_impulse = -contact_damping * relative_velocity * jacobian_diagonal_ab_inverse;
    unilateral_impulse
}

/// General function to resolve a bilateral constraint between two bodies
fn resolve_single_bilateral(
    body1: &RigidBody,
    point1: &Point<Real>,
    body2: &RigidBody,
    point2: &Point<Real>,
    normal: &Vector<Real>,
) -> Real {
    let velocity1 = body1.velocity_at_point(point1);
    let velocity2 = body2.velocity_at_point(point2);
    let velocity_delta = velocity1 - velocity2;

    let position_delta1 = point1 - body1.center_of_mass();
    let position_delta2 = point2 - body2.center_of_mass();
    let jacobian1 = position_delta1.cross(normal);
    let jacobian2 = position_delta2.cross(&-normal);
    let inverse_jacobian1 = body1.mass_properties().effective_world_inv_inertia * jacobian1;
    let inverse_jacobian2 = body2.mass_properties().effective_world_inv_inertia * jacobian2;

    let inverse_mass1 = body1.mass_properties().local_mprops.inv_mass;
    let im2 = body2.mass_properties().local_mprops.inv_mass;

    let jacobian_diagonal_ab = inverse_mass1 + im2 + inverse_jacobian1.dot(&inverse_jacobian1) + inverse_jacobian2.dot(&inverse_jacobian2);
    let jacobian_diagonal_ab_inverse = invert(jacobian_diagonal_ab);
    let relative_velocity = normal.dot(&velocity_delta);

    // TODO: move this into proper structure
    let contact_damping = LATERAL_SMOOTHING;
    let unilateral_impulse = -contact_damping * relative_velocity * jacobian_diagonal_ab_inverse;
    unilateral_impulse
}
