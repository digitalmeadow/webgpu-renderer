use engine_graphics::primitives::{global_transform::GlobalTransform, rotation::Rotation, scale::Scale, translation::Translation};
use engine_maths::Similarity3;
use engine_world::{errors::EngineWorldError, structs::ParentEntity};

use crate::{EngineContext, errors::EngineError};

/// https://github.com/Ralith/hecs/blob/master/examples/transform_hierarchy.rs
pub fn run_engine_transforms_system(context: &mut EngineContext) -> Result<(), EngineError> {
    // Firstly update root entity's GlobalTransforms to their local transforms
    {
        let mut roots = context
            .world
            .ecs
            .query::<(&mut GlobalTransform, &Translation, &Rotation, &Scale)>()
            .without::<&ParentEntity>();

        for (_entity, (global_transform, translation, rotation, scale)) in roots.iter() {
            global_transform.update_from_transforms(None, translation, rotation, scale)
        }
    }

    let mut parents = context.world.ecs.query::<&ParentEntity>();
    let parents = parents.view();

    let mut roots = context
        .world
        .ecs
        .query::<(&Translation, &Rotation, &Scale)>()
        .without::<&ParentEntity>();
    let roots = roots.view();

    let mut children = context
        .world
        .ecs
        .query::<(&ParentEntity, &mut GlobalTransform, &Translation, &Rotation, &Scale)>();

    for (_entity, (parent_entity, global_transform, translation, rotation, scale)) in children.iter() {
        // Walk the hierarchy from this entity to the root, accumulating the entity's global_transform
        // This does a small amount of redundant work for middle entities but is cache-friendly
        let mut relative_similarity = Similarity3::from_parts(translation.0, rotation.0, scale.0);

        // This is our while loop control
        let mut parent = parent_entity;

        // This loop will continue until the next parent doesn't have a parent (current parent must be a root)
        while let Some(next_parent) = parents.get(parent.0) {
            let mut parent_transforms_query = context
                .world
                .ecs
                .query_one::<(&Translation, &Rotation, &Scale)>(parent.0)
                .map_err(|_| EngineWorldError::EntityNotFound("Parent".to_string()))?;
            let (parent_translation, parent_rotation, parent_scale) = parent_transforms_query
                .get()
                .ok_or(EngineWorldError::EntityNotFound("Parent".to_string()))?;

            let parent_similarity = Similarity3::from_parts(parent_translation.0, parent_rotation.0, parent_scale.0);
            relative_similarity = parent_similarity * relative_similarity;

            parent = next_parent;
        }

        // The while loop terminates when ancestor cannot be found in parents, i.e. when it does not have a Parent component, and is therefore a root
        let (root_translation, root_rotation, root_scale) =
            roots.get(parent.0).ok_or(EngineWorldError::EntityNotFound("Root".to_string()))?;

        let root_similarity = Similarity3::from_parts(root_translation.0, root_rotation.0, root_scale.0);
        let final_transform = root_similarity * relative_similarity;

        global_transform.set(final_transform);
    }

    Ok(())
}
