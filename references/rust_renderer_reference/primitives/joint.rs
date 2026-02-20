use engine_maths::Matrix4;

use super::global_transform::GlobalTransform;

#[derive(Debug, Clone)]
pub struct Joint {
    pub id: String,
    inverse_bind_matrix: Matrix4<f32>,
    model_matrix: Matrix4<f32>,
    pub joint_matrix: Matrix4<f32>,
}

impl Joint {
    pub fn new_from_gltf_joint(id: String, inverse_bind_matrix: Matrix4<f32>, global_transform: &GlobalTransform) -> Self {
        Self {
            id,
            inverse_bind_matrix,
            model_matrix: global_transform.matrix(),
            joint_matrix: global_transform.matrix() * inverse_bind_matrix,
        }
    }

    // Update joint matrix based on the local global transform (animated) and the inverse bind matrix (from glTF)
    pub fn update_joint_matrices(&mut self, global_transform: &GlobalTransform) {
        // Construct the model matrix from local transforms
        self.model_matrix = global_transform.matrix();

        // Calculate the joint matrix
        self.joint_matrix = self.model_matrix * self.inverse_bind_matrix;
    }
}
