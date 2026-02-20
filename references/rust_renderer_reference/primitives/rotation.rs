use engine_data::scene::Transform;
use engine_maths::{Quaternion, UnitQuaternion, UnitVector3, Vector3};

#[derive(Debug, Copy, Clone)]
pub struct Rotation(pub UnitQuaternion<f32>);

impl Rotation {
    pub fn new(rotation: UnitQuaternion<f32>) -> Self {
        Self(rotation)
    }

    pub fn new_from_parts(w: f32, i: f32, j: f32, k: f32) -> Self {
        let rotation = UnitQuaternion::from_quaternion(Quaternion::new(w, i, j, k));
        Self::new(rotation)
    }

    pub fn new_from_gltf(gltf_transform: &Transform) -> Self {
        let gltf_transform_decomposed = gltf_transform.clone().decomposed();
        let gltf_rotation = gltf_transform_decomposed.1;

        let rotation = UnitQuaternion::from_quaternion(Quaternion::new(
            gltf_rotation[3],
            gltf_rotation[0],
            gltf_rotation[1],
            gltf_rotation[2],
        ));

        Self::new(rotation)
    }

    pub fn new_from_axis_angle(axis: UnitVector3<f32>, angle: f32) -> Self {
        let rotation = UnitQuaternion::from_axis_angle(&axis, angle);
        Self::new(rotation)
    }

    pub fn new_from_position_target(position: [f32; 3], target: [f32; 3]) -> Self {
        let forward = Vector3::new(position[0] - target[0], position[1] - target[1], position[2] - target[2]).normalize();

        // Choose up vector: use Z-axis if forward is too close to Y-axis to avoid invalid NaN matrices
        let up: UnitVector3<f32> = if forward.dot(&Vector3::y_axis()) > 0.9999 || forward.dot(&Vector3::y_axis()) < -0.9999 {
            Vector3::z_axis()
        } else {
            Vector3::y_axis()
        };

        let rotation = UnitQuaternion::face_towards(&forward, &up);
        Self::new(rotation)
    }

    pub fn set(&mut self, rotation: UnitQuaternion<f32>) {
        self.0 = rotation;
    }

    pub fn rotate(&mut self, rotation: UnitQuaternion<f32>) {
        self.0 = self.0 * rotation;
    }

    pub fn rotate_global(&mut self, rotation: UnitQuaternion<f32>) {
        self.0 = rotation * self.0;
    }
}

impl Default for Rotation {
    fn default() -> Self {
        Self::new_from_parts(1.0, 0.0, 0.0, 0.0)
    }
}
