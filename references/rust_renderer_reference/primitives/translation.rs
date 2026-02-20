use engine_data::scene::Transform;
use engine_maths::Translation3;

#[derive(Debug, Copy, Clone)]
pub struct Translation(pub Translation3<f32>);

impl Translation {
    pub fn new(translation: Translation3<f32>) -> Self {
        Self(translation)
    }

    pub fn new_from_parts(x: f32, y: f32, z: f32) -> Self {
        let translation = Translation3::new(x, y, z);
        Self::new(translation)
    }

    pub fn new_from_gltf(gltf_transform: &Transform) -> Self {
        let gltf_transform_decomposed = gltf_transform.clone().decomposed();
        let gltf_translation = gltf_transform_decomposed.0;

        let translation = Translation3::new(gltf_translation[0], gltf_translation[1], gltf_translation[2]);

        Self::new(translation)
    }

    pub fn set(&mut self, translation: Translation3<f32>) {
        self.0 = translation;
    }

    pub fn translate(&mut self, translation: Translation3<f32>) {
        self.0 *= translation;
    }
}

impl Default for Translation {
    fn default() -> Self {
        Self::new_from_parts(0.0, 0.0, 0.0)
    }
}
