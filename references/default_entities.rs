use std::collections::HashMap;

use engine::{
    EngineContext,
    animation::{animated_by::AnimatedBy, animation_controller::AnimationController, errors::EngineAnimationError},
    core::ResourceHandle,
    data::{
        Node,
        animations::animation_target::AnimationTargetId,
        assets::{
            gltf_model::GltfModel,
            gltf_utils::{check_boolean_of_gltf_extra, extract_extras_from_gltf_node},
        },
    },
    errors::EngineError,
    graphics::{
        errors::EngineGraphicsError,
        primitives::{
            aabb::AABB, global_transform::GlobalTransform, joint::Joint, material::Material, mesh::Mesh, rotation::Rotation, scale::Scale,
            shadows::ShadowCasting, skin::Skin, translation::Translation,
        },
    },
    math::{Const, Isometry3, Matrix4, OPoint},
    physics::{
        bodies::{dynamic_body::DynamicBody, fixed_body::FixedBody, kinematic_body::KinematicBody},
        controllers::rapier3d::prelude::{ActiveEvents, ColliderBuilder},
        errors::EnginePhysicsError,
        utils::convex_hull::ConvexHull,
    },
    world::{Entity, errors::EngineWorldError, structs::ParentEntity},
};

use crate::data::{animations::AnimationTriggerAutoplay, gltf_utils::FlaggedJointNode};

/// Traverses and returns a HashMap of (node_name, node_entity) to caller
pub fn spawn_default_entities_from_gltf(
    context: &mut EngineContext,
    gltf_model_handle: &ResourceHandle,
    parent_entity: Option<&ParentEntity>,
    parent_entity_global_transform: Option<&GlobalTransform>,
) -> Result<HashMap<String, Entity>, EngineError> {
    let mut entities = HashMap::new();

    // Retrieve the loaded gltf model and clone it to prevent double mutable/immutable borrowing of context
    let gltf_model = {
        let gltf_model = context.data.get_gltf_model_by_handle(gltf_model_handle)?;
        gltf_model.clone()
    };

    // Require a single default scene per GLTF
    let scene = gltf_model
        .gltf
        .default_scene()
        .ok_or(EngineGraphicsError::GltfError("No default scene found in GLTF model".to_string()))?;

    let mut flagged_joint_nodes: HashMap<usize, FlaggedJointNode> = HashMap::new();

    // Traverse nodes
    for root_node in scene.nodes() {
        // Traverse node
        // We can safely assume the root node has no parent and therefore its global transform is equal to its local transform and its parent transform is the identity transform
        spawn_default_entity_from_gltf_node(
            context,
            &mut entities,
            &gltf_model,
            &mut flagged_joint_nodes,
            &root_node,
            parent_entity,
            parent_entity_global_transform,
        )?;
    }

    Ok(entities)
}

/// Traverses GLTF node and inserts (node_name, node_entity) with default Components into entities HashMap
/// Checks gltf_extras for flags which can conditionally disable certain components
pub fn spawn_default_entity_from_gltf_node(
    context: &mut EngineContext,
    entities: &mut HashMap<String, Entity>,
    gltf_model: &GltfModel,
    flagged_joint_nodes: &mut HashMap<usize, FlaggedJointNode>,
    node: &Node,
    parent_entity: Option<&ParentEntity>,
    parent_entity_global_transform: Option<&GlobalTransform>,
) -> Result<(), EngineError> {
    // New entity for each node
    let node_entity_builder = &mut context.world.entity_builder;

    let index = node.index();
    let id = node.name().unwrap_or("unnamed").to_string();
    let gltf_extras = extract_extras_from_gltf_node(&node)?;

    // Transforms
    // Construct global transform by multiplying the parent global transform with the local transform
    let mut global_transform = GlobalTransform::default();
    let mut translation = Translation::default();
    let mut rotation = Rotation::default();
    let mut scale = Scale::default();

    // Apply node transforms unless flagged or skin
    if !check_boolean_of_gltf_extra(&gltf_extras, "disable_transforms") {
        translation = Translation::new_from_gltf(&node.transform());
        rotation = Rotation::new_from_gltf(&node.transform());
        scale = Scale::new_from_gltf(&node.transform());
    }

    node_entity_builder.add(translation);
    node_entity_builder.add(rotation);
    node_entity_builder.add(scale);

    // Handle parent tracking by attaching a ParentEntity component to child type nodes and handling global transform setting
    if let Some(parent_entity) = parent_entity {
        node_entity_builder.add(*parent_entity);

        // We ignore the transforms of the skin node, as the root joint node will handle the global transform instead
        if node.skin().is_some() {
            global_transform.update_from_transforms(None, &translation, &rotation, &scale);
            // global_transform.update_from_transforms(parent_entity_global_transform, &translation, &rotation, &scale);
        } else {
            global_transform.update_from_transforms(parent_entity_global_transform, &translation, &rotation, &scale);
        }
    } else {
        global_transform.update_from_transforms(None, &translation, &rotation, &scale);
    }

    node_entity_builder.add(global_transform);

    // Animations
    // If this mesh is a target for animations attach an AnimationTarget component
    let animation_target_id = AnimationTargetId(id.clone());

    // Spawn entity
    let node_entity = context.world.ecs.spawn(node_entity_builder.build());

    // Animation behaviours
    let animation_trigger_label = gltf_extras.0.get("animation_trigger").unwrap_or(&"none".to_string()).to_string();

    if animation_trigger_label == "autoplay" {
        let animation_trigger_autoplay = AnimationTriggerAutoplay {};
        context
            .world
            .ecs
            .insert_one(node_entity, animation_trigger_autoplay)
            .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;

        let animation_clip = {
            context
                .data
                .animation_clips
                .iter()
                .find(|animation_clip| {
                    animation_clip
                        .1
                        .curves
                        .iter()
                        .any(|(target_id, _animation_curve)| *target_id == animation_target_id)
                })
                .ok_or(EngineAnimationError::GltfError("Couldn't find autoplay animation".to_string()))?
                .1
        };

        let animation_controller = AnimationController::new(animation_clip.handle.clone(), animation_clip.duration);
        context
            .world
            .ecs
            .insert_one(node_entity, animation_controller)
            .map_err(|_| EngineWorldError::EntityNotFound("driver_steering_animation_controller_entity".to_string()))?;

        let animated_by = AnimatedBy(node_entity);
        context
            .world
            .ecs
            .insert_one(node_entity, animated_by)
            .map_err(|_| EngineWorldError::EntityNotFound("animation_controller_entity".to_string()))?;
    }

    if gltf_model.animation_target_ids.contains(&animation_target_id) {
        context
            .world
            .ecs
            .insert_one(node_entity, animation_target_id)
            .map_err(|_| EngineWorldError::EntityNotFound("animation_controller_entity".to_string()))?;
    }

    // Handle meshed node
    if let Some(gltf_mesh) = node.mesh() {
        // Primitives (Meshes)
        for primitive in gltf_mesh.primitives() {
            let mut vertex_positions: Vec<OPoint<f32, Const<3>>> = Vec::new();
            let mut vertex_indicies: Vec<[u32; 3]> = Vec::new();

            // Handle different mesh types
            match check_boolean_of_gltf_extra(&gltf_extras, "convex_hull") {
                true => {
                    // Convex Hull
                    let convex_hull = ConvexHull::new_from_gltf_primitive(gltf_model, &primitive, Isometry3::default());

                    // Extract vertex data before component is consumed
                    vertex_positions = convex_hull.vertex_positions.clone();
                    vertex_indicies = convex_hull.vertex_indices.clone();

                    context
                        .world
                        .ecs
                        .insert_one(node_entity, convex_hull)
                        .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
                }
                _ => {
                    if !check_boolean_of_gltf_extra(&gltf_extras, "disable_mesh") {
                        // Standard Mesh
                        let material = Material::new_from_gltf_primitive(gltf_model, &primitive);

                        let mut mesh =
                            Mesh::new_from_gltf_primitive(&context.graphics.surface_state, gltf_model, &primitive, &id, material);

                        context
                            .graphics
                            .renderer
                            .shadow_pass_directional
                            .create_bind_group_for_mesh(&context.graphics.surface_state, &mut mesh)?;

                        context
                            .graphics
                            .renderer
                            .shadow_pass_spot
                            .create_bind_group_for_mesh(&context.graphics.surface_state, &mut mesh)?;

                        context.graphics.renderer.geometry_pass.create_bind_group_for_mesh(
                            &context.graphics.surface_state,
                            &context.data,
                            &mut mesh,
                        )?;

                        // Extract vertex data before component is consumed
                        vertex_positions = mesh.vertex_positions.clone();
                        vertex_indicies = mesh.vertex_indices.clone();

                        context
                            .world
                            .ecs
                            .insert_one(node_entity, mesh)
                            .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
                    }
                }
            }

            // Extras
            // Physics
            let physics_label = gltf_extras.0.get("physics").unwrap_or(&"none".to_string()).to_string();

            // Physics
            match physics_label.as_str() {
                "kinematic" => {
                    let collider = ColliderBuilder::trimesh(vertex_positions.clone(), vertex_indicies.clone())
                        .map_err(|e| EnginePhysicsError::PhysicsError(e.to_string()))?
                        .friction(0.0)
                        .user_data(node_entity.to_bits().get().into())
                        .active_events(ActiveEvents::COLLISION_EVENTS)
                        .build();

                    let kinematic_body = KinematicBody::new(&mut context.physics, collider, global_transform.similarity().isometry)?;

                    context
                        .world
                        .ecs
                        .insert_one(node_entity, kinematic_body)
                        .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
                }
                "dynamic" => {
                    let collider = ColliderBuilder::trimesh(vertex_positions.clone(), vertex_indicies.clone())
                        .map_err(|e| EnginePhysicsError::PhysicsError(e.to_string()))?
                        .friction(0.5)
                        .user_data(node_entity.to_bits().get().into())
                        .active_events(ActiveEvents::COLLISION_EVENTS)
                        .build();

                    let dynamic_body = DynamicBody::new(&mut context.physics, collider, global_transform.similarity().isometry, false)?;

                    context
                        .world
                        .ecs
                        .insert_one(node_entity, dynamic_body)
                        .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
                }
                "fixed" => {
                    let collider = ColliderBuilder::trimesh(vertex_positions.clone(), vertex_indicies.clone())
                        .map_err(|e| EnginePhysicsError::PhysicsError(e.to_string()))?
                        .friction(0.5)
                        .user_data(node_entity.to_bits().get().into())
                        .active_events(ActiveEvents::COLLISION_EVENTS)
                        .build();

                    let fixed_body = FixedBody::new(&mut context.physics, collider, global_transform.similarity().isometry)?;

                    context
                        .world
                        .ecs
                        .insert_one(node_entity, fixed_body)
                        .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
                }
                _ => {}
            }

            // Add AABB to all meshes
            let aabb = AABB::new_from_vertex_positions(&vertex_positions, true);
            context
                .world
                .ecs
                .insert_one(node_entity, aabb)
                .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;

            // Add ShadowCasting to all meshes by default, only skip if specified
            if !check_boolean_of_gltf_extra(&gltf_extras, "shadow_casting_disabled") {
                let shadow_casting = ShadowCasting {};
                context
                    .world
                    .ecs
                    .insert_one(node_entity, shadow_casting)
                    .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;
            } else {
                println!("Shadow casting disabled for mesh {:?}", node.name());
            }
        }
    }

    // Joints
    if flagged_joint_nodes.contains_key(&index) {
        // Create and add Joint component
        let flagged_joint_node = flagged_joint_nodes
            .get(&index)
            .ok_or(EngineAnimationError::GltfError("Flagged joint node not found".to_string()))?;
        let joint = Joint::new_from_gltf_joint(id.clone(), flagged_joint_node.inverse_bind_matrix, &global_transform);

        context
            .world
            .ecs
            .insert_one(node_entity, joint)
            .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;

        // Add the Joint entity into the Skin entity's joints array
        let skin_entity = flagged_joint_node.skin_entity;
        let mut skin = context
            .world
            .ecs
            .get::<&mut Skin>(skin_entity)
            .map_err(|_| EngineWorldError::EntityNotFound("Skin".to_string()))?;

        skin.add_joint(node_entity);
    }

    // Skins
    if let Some(gltf_skin) = node.skin() {
        let skin = Skin::new();
        context
            .world
            .ecs
            .insert_one(node_entity, skin)
            .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;

        // Inverse bind matrices
        let mut inverse_bind_matrices_buffer: Vec<Matrix4<f32>> = Vec::new();
        let reader = gltf_skin.reader(|buffer| Some(&gltf_model.buffer_data[buffer.index()]));

        // Bind matrix indexes will always correspond to the index of the corresponding joint
        if let Some(inverse_bind_matrices) = reader.read_inverse_bind_matrices() {
            for inverse_bind_matrix in inverse_bind_matrices {
                inverse_bind_matrices_buffer.push(inverse_bind_matrix.into());
            }
        }

        // Flag which upcoming nodes are used as joints
        for (index, gltf_joint) in gltf_skin.joints().enumerate() {
            let inverse_bind_matrix = inverse_bind_matrices_buffer[index];

            flagged_joint_nodes.insert(
                gltf_joint.index(),
                FlaggedJointNode {
                    skin_entity: node_entity,
                    inverse_bind_matrix,
                },
            );
        }
    }

    // Finally insert GLTF Extras as a component for later handling
    context
        .world
        .ecs
        .insert_one(node_entity, gltf_extras)
        .map_err(|_| EngineWorldError::EntityNotFound("Node".to_string()))?;

    // Insert node entity into main HashMap
    entities.insert(id, node_entity);

    // Traverse children
    for child in node.children() {
        spawn_default_entity_from_gltf_node(
            context,
            entities,
            gltf_model,
            flagged_joint_nodes,
            &child,
            Some(&ParentEntity(node_entity)),
            Some(&global_transform),
        )?;
    }

    Ok(())
}
