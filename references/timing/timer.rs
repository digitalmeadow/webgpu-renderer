pub struct Timer {
    pub alarm: f32,
    pub current: f32,
    pub finished: bool,
}

impl Timer {
    pub fn new(alarm: f32) -> Self {
        Timer {
            alarm: alarm,
            current: 0.0,
            finished: false,
        }
    }

    pub fn update(&mut self, delta: f32) {
        self.current += delta;

        if self.current >= self.alarm {
            self.finished = true;
            self.current = 0.0;
        } else {
            self.finished = false
        }
    }
}
