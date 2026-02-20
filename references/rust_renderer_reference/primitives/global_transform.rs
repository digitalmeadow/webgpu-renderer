use engine_data::scene::Transform as GltfTransform;
use engine_maths::{Matrix4, Quaternion, Similarity3, Translation3, UnitQuaternion, UnitVector3, Vector3};

use super::{rotation::Rotation, scale::Scale, translation::Translation};

#[derive(Clone, Copy, Debug)]
pub struct GlobalTransform {
    similarity: Similarity3<f32>,
    matrix: Matrix4<f32>,
}

impl GlobalTransform {
    pub fn new(similarity: Similarity3<f32>) -> Self {
        let matrix = similarity.to_homogeneous();
        Self { similarity, matrix }
    }

    pub fn new_from_parts(translation: Translation3<f32>, rotation: UnitQuaternion<f32>, scale: f32) -> Self {
        let similarity = Similarity3::from_parts(translation, rotation, scale);
        GlobalTransform::new(similarity)
    }

    pub fn new_from_gltf(gltf_transform: &GltfTransform) -> Self {
        let gltf_transform_decomposed = gltf_transform.clone().decomposed();

        let gltf_translation = gltf_transform_decomposed.0;
        let gltf_rotation = gltf_transform_decomposed.1;
        let gltf_scale = gltf_transform_decomposed.2;

        let translation = Translation3::new(gltf_translation[0], gltf_translation[1], gltf_translation[2]);
        let rotation = UnitQuaternion::from_quaternion(Quaternion::new(
            gltf_rotation[3],
            gltf_rotation[0],
            gltf_rotation[1],
            gltf_rotation[2],
        ));
        let scale = gltf_scale[0];

        Self::new_from_parts(translation, rotation, scale)
    }

    /// Construct GlobalTransform from world-space position and target for rotation
    pub fn new_from_position_target(position: [f32; 3], target: [f32; 3]) -> Self {
        let translation = Translation::new_from_parts(position[0], position[1], position[2]).0;

        let forward = Vector3::new(position[0] - target[0], position[1] - target[1], position[2] - target[2]).normalize();

        // Choose up vector: use Z-axis if forward is too close to Y-axis to avoid invalid NaN matrices
        let up: UnitVector3<f32> = if forward.dot(&Vector3::y_axis()) > 0.9999 || forward.dot(&Vector3::y_axis()) < -0.9999 {
            Vector3::z_axis()
        } else {
            Vector3::y_axis()
        };
        let rotation = UnitQuaternion::face_towards(&forward, &up);

        GlobalTransform::new_from_parts(translation, rotation, Scale::default().0)
    }

    pub fn set(&mut self, similarity: Similarity3<f32>) {
        self.similarity = similarity;
        self.matrix = similarity.to_homogeneous();
    }

    // Construct a new global transform by combining the parent's global transforms with local transforms
    pub fn update_from_transforms(
        &mut self,
        parent_global_transform: Option<&GlobalTransform>,
        translation: &Translation,
        rotation: &Rotation,
        scale: &Scale,
    ) {
        let local_similarity = Similarity3::from_parts(translation.0, rotation.0, scale.0);
        let mut similarity = local_similarity;

        // If parent exists, include the parent's global transform in the calculation
        if let Some(parent_global_transform) = parent_global_transform {
            similarity = parent_global_transform.similarity() * similarity;
        };

        self.similarity = similarity;

        let matrix = similarity.to_homogeneous();
        self.matrix = matrix;
    }

    pub fn update_from_global_transform(&mut self, global_transform: &GlobalTransform) {
        self.similarity *= global_transform.similarity();

        let matrix = self.similarity.to_homogeneous();
        self.matrix = matrix;
    }

    // Matrix
    pub fn matrix(&self) -> Matrix4<f32> {
        self.matrix
    }

    // Similarity
    pub fn similarity(&self) -> Similarity3<f32> {
        self.similarity
    }
}

impl Default for GlobalTransform {
    fn default() -> Self {
        Self::new_from_parts(
            Translation3::new(0.0, 0.0, 0.0),
            UnitQuaternion::from_quaternion(Quaternion::new(1.0, 0.0, 0.0, 0.0)),
            1.0,
        )
    }
}
