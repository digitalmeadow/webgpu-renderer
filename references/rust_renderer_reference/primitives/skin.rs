use engine_world::Entity;

#[derive(Debug, Clone)]
pub struct Skin {
    pub joints: Vec<Entity>,
}

impl Skin {
    pub fn new() -> Self {
        Self { joints: Vec::new() }
    }

    pub fn add_joint(&mut self, joint: Entity) {
        self.joints.push(joint);
    }
}
