use engine::{
    EngineContext,
    data::errors::EngineDataError,
    errors::EngineError,
    graphics::primitives::particle_emitter::ParticleEmitter,
    math::{Quaternion, Rng, UnitQuaternion, Vector3, interpolation::map_range},
    physics::controllers::vehicle_controller::{VehicleController, Wheel},
    time::time::DELTA_ERROR,
};

use crate::data::particles::{ParticleBehaviourSmoke, ParticleTextureAtlasAnimationLifetime, ParticleTextureAtlasAnimationLoop};

pub fn run_particle_behaviours(context: &mut EngineContext) -> Result<(), EngineError> {
    // ParticleTextureAtlasAnimationLifetime: Animate the texture atlas mapped over the lifetime of the particle
    {
        let mut particles_emitters_texture_atlas_animation_lifetime_query = context
            .world
            .ecs
            .query::<(&mut ParticleEmitter, &ParticleTextureAtlasAnimationLifetime)>();
        for (_entity, (particle_emitter, particle_texture_atlas_animation_lifetime)) in
            particles_emitters_texture_atlas_animation_lifetime_query.iter()
        {
            let atlas_region = context
                .data
                .get_atlas_regions_by_handle(&particle_texture_atlas_animation_lifetime.atlas_regions_handle)?;

            for particle_instance in particle_emitter.system.instances.iter_mut() {
                particle_instance.atlas_region_index = map_range(
                    particle_instance.lifetime,
                    particle_emitter.desc.spawn_lifetimes[particle_instance.spawn_index],
                    0.0,
                    0.0,
                    atlas_region.regions_total as f32,
                )
                .floor() as u32;

                particle_instance.frame_lerp = map_range(
                    particle_instance.lifetime,
                    particle_emitter.desc.spawn_lifetimes[particle_instance.spawn_index],
                    0.0,
                    0.0,
                    atlas_region.regions_total as f32,
                )
                .fract();
            }
        }
    }

    // ParticleTextureAtlasAnimationLoop: Continously loop the animation
    {
        let mut particles_emitters_texture_atlas_animation_loop_query = context
            .world
            .ecs
            .query::<(&mut ParticleEmitter, &mut ParticleTextureAtlasAnimationLoop)>();
        for (_entity, (particle_emitter, particle_texture_atlas_animation_loop)) in
            particles_emitters_texture_atlas_animation_loop_query.iter()
        {
            let atlas_region = context
                .data
                .get_atlas_regions_by_handle(&particle_texture_atlas_animation_loop.atlas_regions_handle)?;

            particle_texture_atlas_animation_loop.delta_accumulator += context.time.delta;

            for particle_instance in particle_emitter.system.instances.iter_mut() {
                // Lerp inbetween frames
                particle_instance.frame_lerp = map_range(
                    particle_texture_atlas_animation_loop.delta_accumulator,
                    0.0,
                    particle_texture_atlas_animation_loop.target_delta,
                    0.0,
                    1.0,
                )
                .fract();

                // Increment atlas animation at target FPS
                if particle_texture_atlas_animation_loop.delta_accumulator + DELTA_ERROR
                    >= particle_texture_atlas_animation_loop.target_delta
                {
                    particle_instance.atlas_region_index += 1;
                    particle_instance.atlas_region_index %= atlas_region.regions_total;
                }
            }

            if particle_texture_atlas_animation_loop.delta_accumulator + DELTA_ERROR >= particle_texture_atlas_animation_loop.target_delta {
                particle_texture_atlas_animation_loop.delta_accumulator = 0.0;
            }
        }
    }

    // Smoke behaviour
    {
        let mut particles_emitters_smoke_query = context.world.ecs.query::<(&mut ParticleEmitter, &ParticleBehaviourSmoke)>();
        for (_entity, (particle_emitter, particle_behaviour_smoke)) in particles_emitters_smoke_query.iter() {
            for (particle_instance_index, particle_instance) in particle_emitter.system.instances.iter_mut().enumerate() {
                let vehicle_controller = context
                    .world
                    .ecs
                    .get::<&VehicleController>(particle_behaviour_smoke.vehicle_entity)
                    .map_err(|_| EngineDataError::DataError("Vehicle controller not found".to_string()))?;

                let wheel = context
                    .world
                    .ecs
                    .get::<&Wheel>(particle_behaviour_smoke.wheel_entity)
                    .map_err(|_| EngineDataError::DataError("Wheel not found".to_string()))?;

                for controller_wheel in vehicle_controller.wheels.iter() {
                    if controller_wheel.index != wheel.index {
                        continue;
                    }

                    // Spawn params
                    particle_emitter.desc.spawn_scales[particle_instance.spawn_index] =
                        map_range(controller_wheel.skid_factor, 0.0, 1.0, 0.1, 1.0).clamp(0.1, 1.0);
                    particle_emitter.desc.spawn_alphas[particle_instance.spawn_index] =
                        map_range(controller_wheel.skid_factor, 0.0, 1.0, 0.0, 1.0).clamp(0.0, 1.0);

                    // The faster the wheel is skidding the faster we want the smoke to fly out the back
                    // We want to scale by the difference between the wheel rotation and the road surface
                    // We can use the rotation_surface_delta (difference between the wheel rotation and the contact surface)
                    let velocity_multiplier = map_range(context.maths.rng.random::<f32>(), 0.0, 1.0, 5.0, 25.0);
                    let mut spawn_velocity =
                        velocity_multiplier * controller_wheel.rotation_surface_delta * controller_wheel.forward_direction_ws.into_inner();

                    spawn_velocity.component_mul_assign(&Vector3::new(
                        context.maths.rng.random::<f32>() + 1.0,
                        1.0,
                        context.maths.rng.random::<f32>() + 1.0,
                    ));

                    particle_emitter.desc.spawn_velocities[particle_instance.spawn_index] =
                        [spawn_velocity[0], spawn_velocity[1], spawn_velocity[2]];
                }

                // Update gradient map
                particle_instance.gradient_map_index = map_range(
                    particle_instance.lifetime,
                    particle_emitter.desc.spawn_lifetimes[particle_instance.spawn_index],
                    0.0,
                    0.0,
                    particle_emitter.system.mesh_particle.material.gradient_map_count as f32,
                ) as u32;

                // Rise
                particle_instance.velocity[1] += 0.05;
                // Decellerate other axis
                particle_instance.velocity[0] *= 0.98;
                particle_instance.velocity[2] *= 0.98;

                // Rotate
                let spin_speed = particle_instance.lifetime * map_range(context.maths.rng.random::<f32>(), 0.0, 1.0, 1.0, 2.0);

                // 3D rotation
                let rotation_amount = UnitQuaternion::from_axis_angle(&Vector3::z_axis(), spin_speed * context.time.delta);

                // Read current rotation as [x, y, z, w]
                let mut current_rotation = UnitQuaternion::from_quaternion(Quaternion::new(
                    particle_instance.rotation[3],
                    particle_instance.rotation[0],
                    particle_instance.rotation[1],
                    particle_instance.rotation[2],
                ));

                if current_rotation.norm() != 1.0 {
                    current_rotation = UnitQuaternion::identity();
                }

                // Compose and write back as [x, y, z, w]
                let target_rotation = rotation_amount * current_rotation;
                let target_rotation_coords = target_rotation.into_inner(); // Quaternion { w, i, j, k }
                particle_instance.rotation = [
                    target_rotation_coords.i,
                    target_rotation_coords.j,
                    target_rotation_coords.k,
                    target_rotation_coords.w,
                ];

                // 2D rotation (for billboarded particles)
                // let spin_speed = 8.0;
                // let spin_amount = particle_instance.lifetime * spin_speed * context.time.delta;
                // particle_instance.rotation[3] += spin_amount;

                // Scale
                particle_instance.scale *= 1.01;
                // Fade out
                particle_instance.alpha *= 0.95;
                // particle_instance.alpha = 0.0;
            }
        }
    }

    // Tyre tracks behaviour
    // {
    //     let mut particles_emitters_smoke_query = context.world.ecs.query::<(&mut ParticleEmitter, &ParticleBehaviourTyreTrack)>();
    //     for (_entity, (particle_emitter, particle_behaviour_tyre_track)) in particles_emitters_smoke_query.iter() {
    //         for particle_instance in particle_emitter.system.instances.iter_mut() {
    //             let vehicle_controller = context
    //                 .world
    //                 .ecs
    //                 .get::<&VehicleController>(particle_behaviour_tyre_track.vehicle_entity)
    //                 .map_err(|_| EngineDataError::DataError("Vehicle controller not found".to_string()))?;

    //             let wheel = context
    //                 .world
    //                 .ecs
    //                 .get::<&Wheel>(particle_behaviour_tyre_track.wheel_entity)
    //                 .map_err(|_| EngineDataError::DataError("Wheel not found".to_string()))?;

    //             for controller_wheel in vehicle_controller.wheels.iter() {
    //                 if controller_wheel.index != wheel.index {
    //                     continue;
    //                 }

    //                 let dir = controller_wheel.forward_direction_ws; // world-space forward direction
    //                 let up = controller_wheel.raycast_info.contact_normal_ws; // world-space contact normal
    //                 let base_quat = UnitQuaternion::face_towards(&dir, &-up);

    //                 // 90 degree rotation around the forward axis
    //                 let extra_rot = UnitQuaternion::from_axis_angle(&controller_wheel.axle_direction_bs, PI / 2.0);

    //                 let final_quat = base_quat * extra_rot;
    //                 let q = final_quat.coords;
    //                 particle_emitter.config.initial_rotation = [q.x, q.y, q.z, q.w];

    //                 let contact_point = controller_wheel.raycast_info.contact_point_ws;
    //                 let contact_normal = controller_wheel.raycast_info.contact_normal_ws.normalize();

    //                 // Offset distance (e.g., -0.05 units below the road)
    //                 let offset_distance = 0.01;
    //                 let emitter_position = contact_point + contact_normal * offset_distance;

    //                 // Set the emitter's position in world space
    //                 particle_emitter.config.initial_position = [emitter_position.x, emitter_position.y, emitter_position.z];

    //                 particle_emitter.config.initial_alpha = map_range(controller_wheel.skid_factor, 0.9, 1.0, 0.0, 1.0).clamp(0.0, 1.0);
    //             }

    //             particle_instance.alpha *= 0.9;
    //         }
    //     }
    // }

    // Sparks behaviour
    // {
    //     let mut particles_emitters_sparks_query = context.world.ecs.query::<(&mut ParticleEmitter, &ParticleBehaviourSparks)>();

    //     for (_entity, (particle_emitter, particle_behaviour_sparks)) in particles_emitters_sparks_query.iter() {
    //         let contact_pair = context.physics.narrow_phase.contact_pair(
    //             particle_behaviour_sparks.collider_handle1,
    //             particle_behaviour_sparks.collider_handle2,
    //         );

    //         let mut contact_force = 0.0;
    //         let mut is_colliding = false;

    //         if let Some(contact_pair) = contact_pair {
    //             is_colliding = contact_pair.has_any_active_contact;

    //             for manifold in &contact_pair.manifolds {
    //                 for contact_point in &manifold.points {
    //                     contact_force = contact_point.data.impulse;
    //                 }
    //             }
    //         }

    //         let intensity = map_range(contact_force, 0.0, 5.0, 0.0, 1.0).clamp(0.0, 1.0);
    //         let velocity_multiplier = map_range(intensity, 0.0, 1.0, 1.0, 2.0);
    //         let alpha = map_range(intensity, 0.0, 1.0, 0.0, 1.0);

    //         particle_emitter.config.initial_alpha = alpha;
    //         particle_emitter.config.initial_scale = 0.1;

    //         if !is_colliding {
    //             particle_emitter.config.initial_alpha = 0.0;
    //         }

    //         for (_index, particle_instance) in particle_emitter.system.instances.iter_mut().enumerate() {
    //             particle_instance.velocity = [
    //                 particle_instance.velocity[0] * velocity_multiplier,
    //                 particle_instance.velocity[1] * velocity_multiplier,
    //                 particle_instance.velocity[2] * velocity_multiplier,
    //             ];

    //             // Gravity
    //             particle_instance.velocity[1] -= 0.001;

    //             // Fade
    //             particle_instance.alpha *= 0.99;
    //         }
    //     }
    // }

    Ok(())
}
