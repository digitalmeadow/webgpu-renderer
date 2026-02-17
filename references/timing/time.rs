use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use engine_ids::{IdContext, ResourceId};

use crate::timer::Timer;

// https://cs.pomona.edu/classes/cs181g/notes/controlling-time.html
pub const DELTA_ERROR: f32 = 1.0e-6;
pub const DEATH_SPIRAL_STEP_LIMIT: u32 = 4;
const DELTA_TARGETS: [f32; 4] = [30.0, 60.0, 120.0, 144.0];

pub struct TimeDesc {
    pub delta_target: f32,
}

impl Default for TimeDesc {
    fn default() -> Self {
        Self { delta_target: 1.0 / 60.0 }
    }
}

pub struct TimeContext {
    /// Game target FPS
    pub delta_target: f32,
    /// Redraw tracking for game update rate control
    previous_redraw_time: Instant,
    pub redraw_delta: f32,
    pub redraw_accumulator: f32,
    pub death_spiral_steps: u32,
    /// Game time variables
    start_time: Instant,
    previous_frame_time: Instant,
    pub duration: Duration,
    pub delta: f32,
    pub timers: HashMap<ResourceId, Timer>,
}

impl TimeContext {
    pub fn new(desc: &TimeDesc) -> Self {
        Self {
            delta_target: desc.delta_target,
            redraw_delta: 1.0 / 60.0,
            previous_redraw_time: Instant::now(),
            redraw_accumulator: 0.0,
            death_spiral_steps: 0,
            start_time: Instant::now(),
            previous_frame_time: Instant::now(),
            duration: Duration::from_secs(0),
            delta: 1.0 / 60.0,
            timers: HashMap::default(),
        }
    }

    /// Call every window redraw (variable FPS)
    pub fn update_redraw(&mut self) {
        let current_time = Instant::now();

        let mut delta = (current_time - self.previous_redraw_time).as_secs_f32();
        // Snap delta to common targets
        DELTA_TARGETS.iter().for_each(|delta_target| {
            if (delta - 1.0 / delta_target).abs() < DELTA_ERROR {
                delta = 1.0 / delta_target;
            }
        });

        self.redraw_delta = delta;
        self.redraw_accumulator += self.redraw_delta;
        self.previous_redraw_time = current_time;
    }

    /// Call on game update (typically 60 FPS)
    pub fn update(&mut self) {
        let current_time = Instant::now();
        let mut delta = (current_time - self.previous_frame_time).as_secs_f32();

        // Snap delta to common targets
        DELTA_TARGETS.iter().for_each(|delta_target| {
            if (delta - 1.0 / delta_target).abs() < DELTA_ERROR {
                delta = 1.0 / delta_target;
            }
        });

        self.delta = delta;
        self.duration = current_time - self.start_time;

        for timer in self.timers.values_mut() {
            timer.update(self.delta);
        }

        self.previous_frame_time = current_time;
    }

    pub fn add_timer(&mut self, id_context: &mut IdContext, tick: f32) -> ResourceId {
        let id = id_context.generate_next_id();
        let timer = Timer::new(tick);
        self.timers.insert(id.clone(), timer);
        id
    }
}
