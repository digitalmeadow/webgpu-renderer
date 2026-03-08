use engine_ids::ResourceHandle;
use engine_maths::interpolation::map_circular;

#[derive(Debug)]
pub struct AnimationController {
    pub handle: ResourceHandle,
    pub animation_clip: ResourceHandle,
    pub duration: f32,
    pub paused: bool,
    pub repeat: bool,
    pub complete: bool,
    pub speed: f32,
    pub current_time: f32,
}

impl AnimationController {
    pub fn new(animation_clip_handle: ResourceHandle, duration: f32) -> Self {
        Self {
            handle: animation_clip_handle.clone(),
            animation_clip: animation_clip_handle,
            duration,
            paused: true,
            repeat: true,
            complete: false,
            speed: 1.0,
            current_time: 0.0,
        }
    }

    pub fn play(&mut self) {
        if self.paused {
            self.current_time = 0.0;
            self.paused = false;
        }
    }

    pub fn stop(&mut self) {
        if !self.paused {
            self.current_time = 0.0;
            self.paused = true;
        }
    }

    pub fn pause(&mut self) {
        if !self.paused {
            self.paused = true;
        }
    }

    pub fn resume(&mut self) {
        if self.paused {
            self.paused = false;
        }
    }

    pub fn seek(&mut self, time: f32) {
        let time_mapped = map_circular(time, 0.0, self.duration);
        self.current_time = time_mapped;
    }

    pub fn update(&mut self, delta: f32) {
        if self.paused {
            return;
        }

        self.current_time += delta * self.speed;

        if self.current_time > self.duration {
            if self.repeat {
                self.current_time = 0.0;
            } else {
                self.current_time = self.duration;
                self.paused = true;
                self.complete = true;
            }
        }
    }
}
