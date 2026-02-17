use engine_animations::{animated_by::AnimatedBy, animation_controller::AnimationController};
use engine_data::animations::{animation_keyframes::AnimationKeyframes, animation_target::AnimationTargetId};
use engine_graphics::primitives::{rotation::Rotation, scale::Scale, translation::Translation};
use engine_maths::interpolation::{lerp_rotation, lerp_scale, lerp_translation};

use crate::{EngineContext, errors::EngineError};

/// Applies animation data to transformation components
pub fn run_engine_animations_system(context: &mut EngineContext) -> Result<(), EngineError> {
    let mut animation_controllers = context.world.ecs.query::<&mut AnimationController>();

    // Update all animation controllers
    for (_animation_controller_entity, animation_controller) in animation_controllers.iter() {
        animation_controller.update(context.time.delta);
    }

    // Transforms
    let mut animation_targets_transforms = context
        .world
        .ecs
        .query::<(&AnimationTargetId, &AnimatedBy, &mut Translation, &mut Rotation, &mut Scale)>();

    for (animation_controller_entity, animation_controller) in animation_controllers.iter() {
        let animation_clip = context.data.get_animation_clip_by_handle(&animation_controller.animation_clip)?;

        for (_entity, (animation_target_id, animated_by, translation, rotation, scale)) in animation_targets_transforms.iter() {
            for (animation_curve_target_id, animation_curve) in &animation_clip.curves {
                if animated_by.0 != animation_controller_entity {
                    continue;
                }

                if *animation_curve_target_id != *animation_target_id {
                    continue;
                }

                let mut previous_keyframe_index = 0;
                let mut current_keyframe_index = 0;

                // Calculate the current keyframe index
                for timestamp in &animation_curve.timestamps {
                    if animation_controller.current_time > *timestamp {
                        previous_keyframe_index = current_keyframe_index;
                        current_keyframe_index += 1;
                    }
                }

                // Calculate how far between the previous and current keyframes we are
                let lerp_factor = (animation_controller.current_time - animation_curve.timestamps[previous_keyframe_index])
                    / (animation_curve.timestamps[current_keyframe_index] - animation_curve.timestamps[previous_keyframe_index]);

                match &animation_curve.keyframes {
                    // Translation
                    AnimationKeyframes::Translation(keyframes) => {
                        let previous_keyframe = &keyframes[previous_keyframe_index];
                        let current_keyframe = &keyframes[current_keyframe_index];

                        let previous_translation = previous_keyframe;
                        let current_translation = current_keyframe;

                        let lerp_translation = lerp_translation(previous_translation, current_translation, lerp_factor);

                        translation.set(lerp_translation);
                    }
                    // Rotation
                    AnimationKeyframes::Rotation(keyframes) => {
                        let previous_keyframe = &keyframes[previous_keyframe_index];
                        let current_keyframe = &keyframes[current_keyframe_index];

                        let previous_rotation = previous_keyframe;
                        let current_rotation = current_keyframe;

                        let lerp_rotation = lerp_rotation(previous_rotation, current_rotation, lerp_factor);

                        rotation.set(lerp_rotation);
                    }
                    // Scale
                    AnimationKeyframes::Scale(keyframes) => {
                        let previous_keyframe = &keyframes[previous_keyframe_index];
                        let current_keyframe = &keyframes[current_keyframe_index];

                        let previous_scale = previous_keyframe;
                        let current_scale = current_keyframe;

                        let lerp_scale = lerp_scale(*previous_scale, *current_scale, lerp_factor);

                        scale.set(lerp_scale);
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
