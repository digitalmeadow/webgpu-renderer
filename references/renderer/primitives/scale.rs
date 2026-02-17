use engine_data::scene::Transform;

#[derive(Debug, Copy, Clone)]
pub struct Scale(pub f32);

impl Scale {
    pub fn new(scale: f32) -> Self {
        Self(scale)
    }

    pub fn new_from_gltf(gltf_transform: &Transform) -> Self {
        let gltf_transform_decomposed = gltf_transform.clone().decomposed();
        let gltf_scale = gltf_transform_decomposed.2;

        let scale = gltf_scale[0]; // Non-uniform scaling only, hence any component of the scale vector will be used

        Self::new(scale)
    }

    pub fn set(&mut self, scale: f32) {
        self.0 = scale;
    }
}

impl Default for Scale {
    fn default() -> Self {
        Self::new(1.0)
    }
}
