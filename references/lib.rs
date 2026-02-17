pub use context::EngineContext;
use engine_audio::AudioContext;
use engine_data::DataContext;
use engine_graphics::GraphicsDesc;
use engine_ids::IdContext;
use engine_inputs::{
    application::ApplicationHandler,
    dpi::PhysicalSize,
    event::{DeviceEvent, DeviceId, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    input::InputContext,
    window::{Window, WindowAttributes, WindowId},
};
use engine_maths::MathsContext;
use engine_physics::{PhysicsContext, PhysicsDesc};
use engine_timing::time::{TimeContext, TimeDesc};
use engine_ui::UiContext;
use graphics::GraphicsContext;
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use traits::Game;
use world::WorldContext;

pub use engine_animations as animation;
pub use engine_audio as audio;
pub use engine_data as data;
pub use engine_graphics as graphics;
pub use engine_ids as core;
pub use engine_inputs as inputs;
pub use engine_maths as math;
pub use engine_physics as physics;
pub use engine_timing as time;
pub use engine_ui as ui;
pub use engine_world as world;

pub mod context;
pub mod errors;
pub mod systems;
pub mod traits;

/// Event loop
pub struct EngineEventLoop(pub EventLoop<()>);

impl EngineEventLoop {
    pub fn new() -> Self {
        let event_loop = EventLoop::new().unwrap_or_else(|e| {
            eprintln!("Failed to create event loop: {:?}", e);
            std::process::exit(1);
        });

        event_loop.set_control_flow(ControlFlow::Poll);
        EngineEventLoop(event_loop)
    }
}

// Engine
// Initialisation parameters
pub struct EngineDesc {
    pub time_desc: TimeDesc,
    pub graphics_desc: GraphicsDesc,
    pub physics_desc: PhysicsDesc,
}

pub struct Engine<T>
where
    T: Game<GraphicsContext> + 'static,
{
    window: Option<Arc<Window>>,
    context: Option<EngineContext>,
    desc: EngineDesc,
    game: T,
}

// Custom methods
impl<T> Engine<T>
where
    T: Game<GraphicsContext> + 'static,
{
    pub fn new(game: T, desc: EngineDesc) -> Self {
        Engine {
            window: None,
            context: None,
            desc,
            game,
        }
    }

    pub async fn build(&mut self, event_loop: &ActiveEventLoop)
    where
        T: Game<GraphicsContext> + 'static,
    {
        let mut window_attributes = WindowAttributes::default();

        let window_size = PhysicalSize::new(self.desc.graphics_desc.viewport_width, self.desc.graphics_desc.viewport_height);
        window_attributes = window_attributes.with_inner_size(window_size);

        let window = Arc::new(event_loop.create_window(window_attributes).unwrap_or_else(|e| {
            eprintln!("Failed to create window: {:?}", e);
            std::process::exit(1);
        }));

        let audio = AudioContext::new();
        let data = DataContext::new();
        let graphics = GraphicsContext::new(window.clone(), &self.desc.graphics_desc).await;
        let id = IdContext::new();
        let input = InputContext::new(window.clone()).expect("Failed to create input context");
        let maths = MathsContext::new();
        let physics = PhysicsContext::new(&self.desc.physics_desc);
        let world = WorldContext::new();
        let time = TimeContext::new(&self.desc.time_desc);
        let ui = UiContext::new();

        let context = EngineContext {
            audio,
            data,
            graphics,
            id,
            input,
            maths,
            physics,
            world,
            time,
            ui,
        };

        self.window = Some(window);
        self.context = Some(context);
    }
}

// Winit application methods
impl<T> ApplicationHandler for Engine<T>
where
    T: Game<GraphicsContext> + 'static,
{
    /// Treating this as our init function
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        // Create window
        self.window = Some(Arc::new(
            event_loop
                .create_window(Window::default_attributes())
                .expect("Failed to create window"),
        ));

        // Create engine
        pollster::block_on(self.build(event_loop));

        let context = self.context.as_mut().expect("Failed to get context");
        let window = self.window.as_ref().expect("Failed to get window");

        // Set up game
        self.game.setup(context).expect("Failed to setup game");

        // Start the game loop
        window.request_redraw();
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            // Rendering
            WindowEvent::RedrawRequested => {
                let context = self.context.as_mut().expect("Failed to get context");
                let window = self.window.as_ref().expect("Failed to get window");

                let frame_start = Instant::now();

                context.time.update_redraw();

                self.game.update(context).expect("Failed to update game");

                context.render().expect("Failed to render");

                context.clear();

                // Sleep until next frame
                let frame_duration = Duration::from_secs_f32(context.time.delta_target);
                let elapsed = frame_start.elapsed();
                if elapsed <= frame_duration {
                    std::thread::sleep(frame_duration - elapsed);
                }

                window.request_redraw();
            }

            // Inputs
            WindowEvent::KeyboardInput { event, .. } => {
                let context = self.context.as_mut().expect("Failed to get context");
                context.input.handle_keyboard(&event);
            }
            WindowEvent::MouseInput { button, state, .. } => {
                let context = self.context.as_mut().expect("Failed to get context");
                context.input.handle_mouse_button(&button, &state);
            }
            WindowEvent::CursorMoved { position, .. } => {
                let context = self.context.as_mut().expect("Failed to get context");
                context.input.handle_mouse_move(position);
            }

            WindowEvent::Resized(_physical_size) => {
                if let Some(context) = &mut self.context {
                    self.game.resize(context);
                }
            }

            WindowEvent::CloseRequested => event_loop.exit(),
            _ => {}
        }
    }

    fn device_event(&mut self, _event_loop: &ActiveEventLoop, _device_id: DeviceId, event: DeviceEvent) {
        match event {
            DeviceEvent::MouseMotion { delta } => {
                let context = self.context.as_mut().expect("Failed to get context");
                context.input.handle_mouse_delta(delta);
            }

            _ => {}
        }
    }
}
