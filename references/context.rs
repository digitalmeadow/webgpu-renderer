use std::collections::HashMap;

use engine_audio::AudioContext;
use engine_data::DataContext;
use engine_graphics::{
    GraphicsContext,
    flags::forward_rendered::ForwardRendered,
    primitives::{
        aabb::AABB,
        camera::PerspectiveCamera,
        fustrum_plane::{aabb_in_frustum, frustum_planes_from_matrix},
        light_directional::{LightDirectional, SHADOW_MAP_CASCADES_COUNT},
        light_spot::LightSpot,
        mesh::Mesh,
        particle_emitter::ParticleEmitter,
        shadows::ShadowCasting,
    },
};
use engine_ids::IdContext;
use engine_inputs::input::InputContext;
use engine_maths::MathsContext;
use engine_physics::PhysicsContext;
use engine_timing::time::TimeContext;
use engine_ui::UiContext;
use engine_world::{Entity, WorldContext, errors::EngineWorldError};

use crate::errors::EngineError;

pub struct EngineContext {
    pub audio: AudioContext,
    pub data: DataContext,
    pub graphics: GraphicsContext,
    pub id: IdContext,
    pub input: InputContext,
    pub maths: MathsContext,
    pub physics: PhysicsContext,
    pub world: WorldContext,
    pub time: TimeContext,
    pub ui: UiContext,
}

// Game APIs
impl EngineContext {
    pub fn update(&mut self) -> Result<(), EngineError> {
        self.input.handle_gamepads();
        self.time.update();
        self.physics.update()?;
        self.audio.update();

        Ok(())
    }

    pub fn render(&mut self) -> Result<(), EngineError> {
        let camera = self.world.active_camera;

        if let Some(camera) = camera {
            let mut camera_option = self
                .world
                .ecs
                .query_one::<&PerspectiveCamera>(camera)
                .map_err(|_| EngineWorldError::EntityNotFound("Camera".to_string()))?;

            let camera = camera_option
                .get()
                .ok_or(EngineWorldError::EntityNotFound("Render Camera".to_string()))?;

            let mut light_directionals_query = self.world.ecs.query::<&mut LightDirectional>();
            let mut lights_spot_query = self.world.ecs.query::<&mut LightSpot>();

            // Filter meshes to be rendered
            let mut meshes_rendered: Vec<&Mesh> = Vec::new();

            // Meshes without AABBs are always rendered
            let mut meshes_raw = self.world.ecs.query::<&Mesh>().without::<(&AABB, &ForwardRendered)>();
            for (_entity, mesh) in meshes_raw.iter() {
                meshes_rendered.push(mesh);
            }

            // Meshes with AABBs get frustum culled if culling is enabled
            let mut meshes_aabb = self.world.ecs.query::<(&Mesh, &AABB)>().without::<&ForwardRendered>();

            let planes = frustum_planes_from_matrix(&camera.view_projection_matrix);

            for (_entity, (mesh, aabb)) in meshes_aabb.iter() {
                if aabb.frustum_cull {
                    if aabb_in_frustum(&aabb.min_ws, &aabb.max_ws, &planes) {
                        meshes_rendered.push(mesh);
                    } else {
                        // println!("Frustum culled: {:?}", mesh.id);
                    }
                } else {
                    meshes_rendered.push(mesh);
                    continue;
                };
            }

            // Forward rendered meshes (transparent etc)
            // Filter meshes to be rendered
            let mut meshes_forward_rendered: Vec<&Mesh> = Vec::new();

            // Meshes without AABBs are always rendered
            let mut meshes_forward_raw = self.world.ecs.query::<(&Mesh, &ForwardRendered)>().without::<&AABB>();
            for (_entity, (mesh, _forward_rendered)) in meshes_forward_raw.iter() {
                meshes_forward_rendered.push(mesh);
            }

            // Meshes with AABBs get frustum culled if culling is enabled
            let mut meshes_forward_aabb = self.world.ecs.query::<(&Mesh, &ForwardRendered, &AABB)>();

            for (_entity, (mesh, _forward_rendered, aabb)) in meshes_forward_aabb.iter() {
                if aabb.frustum_cull {
                    if aabb_in_frustum(&aabb.min_ws, &aabb.max_ws, &planes) {
                        meshes_forward_rendered.push(mesh);
                    } else {
                        // println!("Frustum culled: {:?}", mesh.id);
                    }
                } else {
                    meshes_forward_rendered.push(mesh);
                    continue;
                };
            }

            // Shadow casting meshes (per light, per cascade)
            let mut meshes_shadow_casting_query = self
                .world
                .ecs
                .query::<(&Mesh, &AABB, &ShadowCasting)>()
                .without::<&ForwardRendered>();
            let mut meshes_shadow_casting_rendered_entities_per_light_directional: HashMap<Entity, Vec<Vec<Entity>>> = HashMap::new();
            let mut meshes_shadow_casting_rendered_entities_per_light_spot: HashMap<Entity, Vec<Entity>> = HashMap::new();

            for (light_directional_entity, light_directional) in light_directionals_query.iter() {
                let mut meshes_per_light_directional: Vec<Vec<Entity>> = Vec::new();

                for cascade_index in 0..SHADOW_MAP_CASCADES_COUNT {
                    let mut meshes_per_light_directional_cascade: Vec<Entity> = Vec::new();

                    let planes = frustum_planes_from_matrix(&light_directional.view_projection_matrices[cascade_index]);

                    for (mesh_shadow_casting_entity, (_mesh, aabb, _shadow_casting)) in meshes_shadow_casting_query.iter() {
                        if aabb.frustum_cull {
                            if aabb_in_frustum(&aabb.min_ws, &aabb.max_ws, &planes) {
                                meshes_per_light_directional_cascade.push(mesh_shadow_casting_entity);
                            } else {
                                // println!("Frustum culled: {:?}", mesh.id);
                            }
                        } else {
                            meshes_per_light_directional_cascade.push(mesh_shadow_casting_entity);
                            continue;
                        };
                    }

                    meshes_per_light_directional.push(meshes_per_light_directional_cascade);
                }

                meshes_shadow_casting_rendered_entities_per_light_directional
                    .insert(light_directional_entity, meshes_per_light_directional);
            }

            for (light_spot_entity, light_spot) in lights_spot_query.iter() {
                let mut meshes_per_light_spot: Vec<Entity> = Vec::new();

                let planes = frustum_planes_from_matrix(&light_spot.view_projection_matrix);

                for (mesh_shadow_casting_entity, (_mesh, aabb, _shadow_casting)) in meshes_shadow_casting_query.iter() {
                    if aabb.frustum_cull {
                        if aabb_in_frustum(&aabb.min_ws, &aabb.max_ws, &planes) {
                            meshes_per_light_spot.push(mesh_shadow_casting_entity);
                        } else {
                            // println!("Frustum culled: {:?}", mesh.id);
                        }
                    } else {
                        meshes_per_light_spot.push(mesh_shadow_casting_entity);
                        continue;
                    };
                }

                meshes_shadow_casting_rendered_entities_per_light_spot.insert(light_spot_entity, meshes_per_light_spot);
            }

            let mut particles_emitters_query = self.world.ecs.query::<&ParticleEmitter>();

            let meshes_text = self.ui.get_mesh_texts_from_visible_widgets()?;

            self.graphics.render(
                &self.time,
                camera,
                &mut light_directionals_query,
                &mut lights_spot_query,
                &mut meshes_shadow_casting_query,
                &meshes_shadow_casting_rendered_entities_per_light_directional,
                &meshes_shadow_casting_rendered_entities_per_light_spot,
                &meshes_rendered,
                &meshes_forward_rendered,
                &mut particles_emitters_query,
                &meshes_text,
            );
        }

        Ok(())
    }

    pub fn clear(&mut self) {
        self.input.clear();
    }
}
