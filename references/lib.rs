use std::{collections::HashMap, sync::Arc};

use engine_inputs::window::Window;
use engine_timing::time::TimeContext;
use engine_world::{Entity, QueryBorrow, Without};
use primitives::{camera::PerspectiveCamera, mesh::Mesh, mesh_text::MeshText};

pub use engine_data::Node;
use renderer::Renderer;
use wgpu::{
    Device, DeviceDescriptor, ExperimentalFeatures, Features, Instance, Limits, MemoryHints, PowerPreference, Queue, RequestAdapterOptions,
    Surface, SurfaceConfiguration, TextureUsages, Trace,
};

use crate::{
    flags::forward_rendered::ForwardRendered,
    primitives::{
        aabb::AABB, light_directional::LightDirectional, light_spot::LightSpot, particle_emitter::ParticleEmitter, shadows::ShadowCasting,
    },
};

pub mod errors;
pub mod flags;
pub mod primitives;

mod renderer;

pub struct SurfaceState {
    surface: Surface<'static>,
    device: Device,
    queue: Queue,
    config: SurfaceConfiguration,
}

#[derive(Default)]
pub struct GraphicsDesc {
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub render_width: Option<u32>,
    pub render_height: Option<u32>,
}

pub struct GraphicsContext {
    pub surface_state: SurfaceState,
    pub renderer: Renderer,
}

impl GraphicsContext {
    pub async fn new(window: Arc<Window>, desc: &GraphicsDesc) -> Self {
        let instance = Instance::default();

        let window = window.clone();
        let surface = instance.create_surface(window).expect("Failed to create surface");

        let adapter = instance
            .request_adapter(&RequestAdapterOptions {
                power_preference: PowerPreference::default(),
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .expect("Failed to find an appropriate adapter");

        // Create the logical device and command queue
        let (device, queue) = adapter
            .request_device(&DeviceDescriptor {
                label: None,
                required_features: Features::empty(),
                required_limits: Limits::default(),
                memory_hints: MemoryHints::default(),
                trace: Trace::Off,
                experimental_features: ExperimentalFeatures::disabled(),
            })
            .await
            .expect("Failed to create device");

        let surface_capabilities = surface.get_capabilities(&adapter);
        let surface_format = surface_capabilities
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(surface_capabilities.formats[0]);

        let config = SurfaceConfiguration {
            usage: TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: desc.viewport_width,
            height: desc.viewport_height,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: surface_capabilities.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 1,
        };

        surface.configure(&device, &config);

        let surface_state = SurfaceState {
            surface,
            device,
            queue,
            config,
        };

        let renderer = Renderer::new(&surface_state, desc);

        Self { surface_state, renderer }
    }

    pub fn render(
        &mut self,
        time: &TimeContext,
        camera: &PerspectiveCamera,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        lights_spot_query: &mut QueryBorrow<'_, &mut LightSpot>,
        meshes_shadow_casting_query: &mut QueryBorrow<'_, Without<(&Mesh, &AABB, &ShadowCasting), &ForwardRendered>>,
        meshes_shadow_casting_rendered_entities_per_light_directional: &HashMap<Entity, Vec<Vec<Entity>>>,
        meshes_shadow_casting_rendered_entities_per_light_spot: &HashMap<Entity, Vec<Entity>>,
        meshes_rendered: &Vec<&Mesh>,
        meshes_forward_rendered: &Vec<&Mesh>,
        particles_emitters_query: &mut QueryBorrow<'_, &ParticleEmitter>,
        meshes_text: &Vec<&MeshText>,
    ) {
        self.renderer
            .render(
                &self.surface_state,
                time,
                camera,
                light_directionals_query,
                lights_spot_query,
                meshes_shadow_casting_query,
                meshes_shadow_casting_rendered_entities_per_light_directional,
                meshes_shadow_casting_rendered_entities_per_light_spot,
                meshes_rendered,
                meshes_forward_rendered,
                particles_emitters_query,
                meshes_text,
            )
            .expect("Failed to render");
    }
}
