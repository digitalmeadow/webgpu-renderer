use std::collections::HashMap;

use engine_timing::time::TimeContext;
use engine_world::{Entity, QueryBorrow, Without};

use crate::{
    GraphicsDesc, SurfaceState,
    errors::EngineGraphicsError,
    flags::forward_rendered::ForwardRendered,
    primitives::{
        aabb::AABB, camera::PerspectiveCamera, light_directional::LightDirectional, light_spot::LightSpot, mesh::Mesh, mesh_text::MeshText,
        particle_emitter::ParticleEmitter, shadows::ShadowCasting,
    },
    renderer::{
        passes::{
            forward_pass::ForwardPass, geometry_pass::GeometryBufferPass, lighting_pass::LightingPass, output_pass::OutputPass,
            particles_pass::ParticlesPass, post_pass::PostPass, reflection_pass::ReflectionPass,
            shadow_pass_directional::ShadowPassDirectional, shadow_pass_spot::ShadowPassSpot, text_pass::TextPass,
        },
        shared_buffers::{context_buffer::ContextBuffer, geometry_buffer::GeometryBuffer},
    },
};

pub mod passes;
pub mod shared_buffers;

pub struct Renderer {
    pub context_buffer: ContextBuffer,
    pub geometry_buffer: GeometryBuffer,
    pub shadow_pass_directional: ShadowPassDirectional,
    pub shadow_pass_spot: ShadowPassSpot,
    pub geometry_pass: GeometryBufferPass,
    pub lighting_pass: LightingPass,
    pub forward_pass: ForwardPass,
    pub reflection_pass: ReflectionPass,
    pub particles_pass: ParticlesPass,
    pub post_pass: PostPass,
    pub text_pass: TextPass,
    pub output_pass: OutputPass,
}

impl Renderer {
    pub fn new(surface_state: &SurfaceState, desc: &GraphicsDesc) -> Self {
        let context_buffer = ContextBuffer::new(surface_state, desc.render_width, desc.render_height);
        let geometry_buffer = GeometryBuffer::new(surface_state, desc.render_width, desc.render_height);

        let shadow_pass_directional = ShadowPassDirectional::new(surface_state, &context_buffer, Some(2048), Some(2048));
        let shadow_pass_spot = ShadowPassSpot::new(surface_state, &context_buffer, Some(1024), Some(1024));
        let geometry_pass = GeometryBufferPass::new(surface_state, &context_buffer);
        let lighting_pass = LightingPass::new(
            surface_state,
            &context_buffer,
            &geometry_buffer,
            desc.render_width,
            desc.render_height,
        );
        let forward_pass = ForwardPass::new(surface_state, &context_buffer);
        let reflection_pass = ReflectionPass::new(surface_state, &context_buffer, desc.render_width, desc.render_height);
        let particles_pass = ParticlesPass::new(surface_state, &context_buffer, desc.render_width, desc.render_height);
        let post_pass = PostPass::new(surface_state, &context_buffer, desc.render_width, desc.render_height);
        let text_pass = TextPass::new(surface_state, &context_buffer, None, None);
        let output_pass = OutputPass::new(surface_state);

        Self {
            context_buffer,
            geometry_buffer,
            shadow_pass_directional,
            shadow_pass_spot,
            geometry_pass,
            lighting_pass,
            forward_pass,
            reflection_pass,
            particles_pass,
            post_pass,
            text_pass,
            output_pass,
        }
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        time: &TimeContext,
        camera: &PerspectiveCamera,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        light_spots_query: &mut QueryBorrow<'_, &mut LightSpot>,
        meshes_shadow_casting_query: &mut QueryBorrow<'_, Without<(&Mesh, &AABB, &ShadowCasting), &ForwardRendered>>,
        meshes_shadow_casting_rendered_entities_per_light_directional: &HashMap<Entity, Vec<Vec<Entity>>>,
        meshes_shadow_casting_rendered_entities_per_light_spot: &HashMap<Entity, Vec<Entity>>,
        meshes_rendered: &Vec<&Mesh>,
        meshes_forward_rendered: &Vec<&Mesh>,
        particles_emitters_query: &mut QueryBorrow<'_, &ParticleEmitter>,
        meshes_text: &Vec<&MeshText>,
    ) -> Result<(), EngineGraphicsError> {
        // Update shared buffers
        self.context_buffer.update(surface_state, time);

        // Passes
        // Geometry
        self.geometry_pass
            .render(surface_state, &self.context_buffer, &self.geometry_buffer, camera, meshes_rendered)
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;

        // Shadows
        self.shadow_pass_directional
            .render(
                surface_state,
                &self.context_buffer,
                light_directionals_query,
                meshes_shadow_casting_query,
                meshes_shadow_casting_rendered_entities_per_light_directional,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let shadow_directional_texture_array_view = &self.shadow_pass_directional.shadow_texture_array_view;

        self.shadow_pass_spot
            .render(
                surface_state,
                &self.context_buffer,
                light_spots_query,
                meshes_shadow_casting_query,
                meshes_shadow_casting_rendered_entities_per_light_spot,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let shadow_spot_texture_array_view = &self.shadow_pass_spot.shadow_texture_array_view;

        // Lighting
        self.lighting_pass
            .render(
                surface_state,
                &self.context_buffer,
                &self.geometry_buffer,
                camera,
                light_directionals_query,
                shadow_directional_texture_array_view,
                light_spots_query,
                shadow_spot_texture_array_view,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let lighting_pass_color_view = &self.lighting_pass.output_color_view;

        // Reflections
        self.reflection_pass
            .render(surface_state, &self.context_buffer, camera, &lighting_pass_color_view)
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let reflection_pass_color_view = &self.reflection_pass.output_color_view;

        // Forward pass (transparency)
        self.forward_pass
            .render(
                surface_state,
                &self.context_buffer,
                &self.geometry_buffer,
                reflection_pass_color_view,
                camera,
                meshes_forward_rendered,
                light_directionals_query,
                shadow_directional_texture_array_view,
                light_spots_query,
                shadow_spot_texture_array_view,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;

        // Particles
        self.particles_pass
            .render(
                surface_state,
                &self.context_buffer,
                camera,
                particles_emitters_query,
                reflection_pass_color_view,
                &self.geometry_buffer.depth_view,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;

        // Post (AO)
        self.post_pass
            .render(
                surface_state,
                &self.context_buffer,
                camera,
                &reflection_pass_color_view,
                &self.geometry_buffer.normal_roughness_view,
                &self.geometry_buffer.depth_view,
            )
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let post_pass_color_view = &self.post_pass.output_color_view;

        // Text
        self.text_pass
            .render(surface_state, &self.context_buffer, meshes_text)
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;
        let text_pass_color_view = &self.text_pass.output_color_view;

        // Output
        self.output_pass
            .render(surface_state, post_pass_color_view, text_pass_color_view)
            .map_err(|e| EngineGraphicsError::RendererError(e.to_string()))?;

        Ok(())
    }
}
