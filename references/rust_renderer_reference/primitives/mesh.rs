use engine_data::Primitive;
use engine_data::assets::gltf_model::GltfModel;
use engine_maths::{Const, OPoint};
use engine_world::World;

use crate::errors::EngineGraphicsError;
use crate::{
    SurfaceState,
    primitives::{material::Material, vertex_mesh::VertexMesh},
};

use super::{global_transform::GlobalTransform, joint::Joint, skin::Skin};

const MAX_JOINTS: u64 = 128;

#[derive(Debug, Clone)]
pub struct Mesh {
    pub id: String,
    // Components
    pub vertices: Vec<VertexMesh>,
    pub material: Material,
    // Nalgebra
    pub vertex_positions: Vec<OPoint<f32, Const<3>>>,
    pub vertex_indices: Vec<[u32; 3]>,
    // Buffers
    pub wgpu_vertex_buffer: wgpu::Buffer,
    pub wgpu_index_buffer: wgpu::Buffer,
    pub wgpu_mesh_uniforms_buffer: wgpu::Buffer,
    pub wgpu_material_uniforms_buffer: wgpu::Buffer,
    pub wgpu_draw_range: u32,
    // Bindings
    pub bind_group_for_shadow_pass_directional: Option<wgpu::BindGroup>,
    pub bind_group_for_shadow_pass_spot: Option<wgpu::BindGroup>,
    pub bind_group_for_geometry_pass: Option<wgpu::BindGroup>,
    pub bind_group_for_forward_pass: Option<wgpu::BindGroup>,
}

impl Mesh {
    pub fn new_from_gltf_primitive(
        surface_state: &SurfaceState,
        gltf_model: &GltfModel,
        primitive: &Primitive,
        id: &String,
        material: Material,
    ) -> Self {
        let id = id.clone();

        let reader = primitive.reader(|buffer| Some(&gltf_model.buffer_data[buffer.index()]));

        let mut vertices = Vec::new();

        let mut index_buffer: Vec<u32> = Vec::new();
        let mut vertex_positions_buffer: Vec<[f32; 4]> = Vec::new();
        let mut vertex_normals_buffer: Vec<[f32; 4]> = Vec::new();
        let mut vertex_uv_coords_buffer: Vec<[f32; 2]> = Vec::new();
        let mut vertex_joint_indices_buffer: Vec<[f32; 4]> = Vec::new();
        let mut vertex_joint_weights_buffer: Vec<[f32; 4]> = Vec::new();

        // [position.x, position.y, position.z, position.w, normal.x, normal.y ...]
        let mut vertex_buffer: Vec<f32> = Vec::new();

        // Vertex indices
        if let Some(indices) = reader.read_indices() {
            for index in indices.into_u32() {
                index_buffer.push(index);
            }
        }

        // Vertex positions
        if let Some(positions) = reader.read_positions() {
            for position in positions {
                vertex_positions_buffer.push([position[0], position[1], position[2], 1.0]);
            }
        }

        // Vertex normals
        if let Some(normals) = reader.read_normals() {
            for normal in normals {
                vertex_normals_buffer.push([normal[0], normal[1], normal[2], 1.0]);
            }
        }

        // Vertex uvs
        if let Some(uvs) = reader.read_tex_coords(0) {
            for uv in uvs.into_f32() {
                vertex_uv_coords_buffer.push([uv[0], uv[1]]);
            }
        }

        // Vertex joints
        if let Some(joints) = reader.read_joints(0) {
            for joint in joints.into_u16() {
                vertex_joint_indices_buffer.push([joint[0] as f32, joint[1] as f32, joint[2] as f32, joint[3] as f32]);
            }
        } else {
            // If no joints are found, create a default joint
            for _ in 0..vertex_positions_buffer.len() {
                vertex_joint_indices_buffer.push([0.0, 0.0, 0.0, 0.0]);
            }
        }

        // Vertex weights
        if let Some(weights) = reader.read_weights(0) {
            for weight in weights.into_f32() {
                vertex_joint_weights_buffer.push([weight[0], weight[1], weight[2], weight[3]]);
            }
        } else {
            // If no weights are found, create a default weight
            for _ in 0..vertex_positions_buffer.len() {
                vertex_joint_weights_buffer.push([1.0, 0.0, 0.0, 0.0]);
            }
        }

        // Create the vertices
        assert!(vertex_positions_buffer.len() > 0, "Mesh is invalid: {:?}", id);
        assert!(vertex_normals_buffer.len() > 0, "Mesh is invalid: {:?}", id);

        for i in 0..vertex_positions_buffer.len() {
            let vertex = VertexMesh {
                position: vertex_positions_buffer[i],
                normal: vertex_normals_buffer[i],
                uv_coords: vertex_uv_coords_buffer[i],
                joint_indices: vertex_joint_indices_buffer[i],
                joint_weights: vertex_joint_weights_buffer[i],
            };

            vertices.push(vertex);

            // Create the wgpu vertex buffer defined by Vertex struct
            vertex_buffer.push(vertex.position[0]);
            vertex_buffer.push(vertex.position[1]);
            vertex_buffer.push(vertex.position[2]);
            vertex_buffer.push(vertex.position[3]);
            vertex_buffer.push(vertex.normal[0]);
            vertex_buffer.push(vertex.normal[1]);
            vertex_buffer.push(vertex.normal[2]);
            vertex_buffer.push(vertex.normal[3]);
            vertex_buffer.push(vertex.uv_coords[0]);
            vertex_buffer.push(vertex.uv_coords[1]);
            vertex_buffer.push(vertex.joint_indices[0]);
            vertex_buffer.push(vertex.joint_indices[1]);
            vertex_buffer.push(vertex.joint_indices[2]);
            vertex_buffer.push(vertex.joint_indices[3]);
            vertex_buffer.push(vertex.joint_weights[0]);
            vertex_buffer.push(vertex.joint_weights[1]);
            vertex_buffer.push(vertex.joint_weights[2]);
            vertex_buffer.push(vertex.joint_weights[3]);
        }

        // Print the vertex data
        // println!("Vertex indices: {:?}", index_buffer);
        // println!("Vertex positions: {:?}", vertex_positions_buffer);
        // println!("Vertex normals: {:?}", vertex_normals_buffer);
        // println!("Vertex tex coords: {:?}", vertex_uv_coords_buffer);
        // println!("Vertex joint indices: {:?}", vertex_joint_indices_buffer);
        // println!("Vertex joint weights: {:?}", vertex_joint_weights_buffer);
        // println!("Vertices: {:?}", vertices);
        // println!("Vertex buffer: {:?}", vertex_buffer);

        // Nalgebra
        let vertex_positions: Vec<OPoint<f32, Const<3>>> = vertex_positions_buffer
            .iter()
            .map(|position| OPoint::from([position[0], position[1], position[2]]))
            .collect();

        let vertex_indices: Vec<[u32; 3]> = index_buffer.chunks(3).map(|chunk| [chunk[0], chunk[1], chunk[2]]).collect();

        // Create the wgpu buffers
        let wgpu_vertex_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Vertex Buffer"),
            size: (vertex_buffer.len() * std::mem::size_of::<f32>()) as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_index_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Index Buffer"),
            size: (index_buffer.len() * std::mem::size_of::<u32>()) as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::INDEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_mesh_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Mesh Uniforms Buffer"),
            // model_transform_matrix + joint_matrices + apply_skinning
            size: (4 * 4 * 4) + ((4 * 4 * 4) * MAX_JOINTS) + (4 * 4) as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_material_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Material Uniforms Buffer"),
            // gradient_map_enabled, gradient_map_count, gradient_map_index
            size: 4 + 4 + 4 as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Vertex and index buffer can be written to directly on initialisation
        surface_state
            .queue
            .write_buffer(&wgpu_vertex_buffer, 0, bytemuck::cast_slice(&vertex_buffer));

        surface_state
            .queue
            .write_buffer(&wgpu_index_buffer, 0, bytemuck::cast_slice(&index_buffer));

        Self {
            id,
            vertices,
            material,
            vertex_positions,
            vertex_indices,
            wgpu_vertex_buffer,
            wgpu_index_buffer,
            wgpu_mesh_uniforms_buffer,
            wgpu_material_uniforms_buffer,
            wgpu_draw_range: index_buffer.len() as u32,
            bind_group_for_shadow_pass_directional: None,
            bind_group_for_shadow_pass_spot: None,
            bind_group_for_geometry_pass: None,
            bind_group_for_forward_pass: None,
        }
    }

    /// Helper function for GLTF files containing a single scene with a single mesh primitive
    pub fn new_from_gltf_singleton_scene(surface_state: &SurfaceState, gltf_model: &GltfModel) -> Result<Mesh, EngineGraphicsError> {
        let scene = gltf_model
            .gltf
            .default_scene()
            .ok_or(EngineGraphicsError::GltfError("No default scene found in GLTF model".to_string()))?;

        let root_node = scene
            .nodes()
            .next()
            .ok_or(EngineGraphicsError::GltfError("No root node found in GLTF scene".to_string()))?;

        let gltf_mesh = root_node
            .mesh()
            .ok_or(EngineGraphicsError::GltfError("No mesh found in GLTF node".to_string()))?;

        let id = root_node
            .name()
            .ok_or(EngineGraphicsError::GltfError("No name found in GLTF node".to_string()))?
            .to_string();

        let primitive = gltf_mesh
            .primitives()
            .next()
            .ok_or(EngineGraphicsError::GltfError("No primitive found in GLTF mesh".to_string()))?;

        let material = Material::new_from_gltf_primitive(gltf_model, &primitive);
        let mesh = Mesh::new_from_gltf_primitive(surface_state, gltf_model, &primitive, &id, material);

        Ok(mesh)
    }

    pub fn update_transform_uniforms(&mut self, surface_state: &SurfaceState, global_transform: &GlobalTransform) {
        let model_matrix = global_transform.matrix();
        let model_matrix_slice = model_matrix.as_slice();

        surface_state
            .queue
            .write_buffer(&self.wgpu_mesh_uniforms_buffer, 0, bytemuck::cast_slice(model_matrix_slice));
    }

    pub fn update_joint_uniforms(&mut self, surface_state: &SurfaceState, world: &World, skin: &Skin) -> Result<(), EngineGraphicsError> {
        let mut joint_matrices: Vec<f32> = Vec::new();

        for joint_entity in skin.joints.iter() {
            let joint = world
                .get::<&Joint>(*joint_entity)
                .map_err(|_| EngineGraphicsError::GltfError("Joint not found".to_string()))?;
            let joint_matrix_slice = joint.joint_matrix.as_slice();
            joint_matrices.extend_from_slice(joint_matrix_slice);
        }

        surface_state
            .queue
            .write_buffer(&self.wgpu_mesh_uniforms_buffer, 4 * 4 * 4, bytemuck::cast_slice(&joint_matrices));

        Ok(())
    }

    pub fn update_apply_skinning_uniform(&mut self, surface_state: &SurfaceState, apply_skinning: bool) {
        let apply_skinning_value: u32 = if apply_skinning { 1.0 as u32 } else { 0.0 as u32 };

        surface_state.queue.write_buffer(
            &self.wgpu_mesh_uniforms_buffer,
            4 * 4 * 4 + (4 * 4 * 4 * MAX_JOINTS) as wgpu::BufferAddress,
            bytemuck::cast_slice(&[apply_skinning_value]),
        );
    }

    pub fn update_material_uniforms(&mut self, surface_state: &SurfaceState) {
        let gradient_map_enabled_value: u32 = if self.material.gradient_map_enabled {
            1.0 as u32
        } else {
            0.0 as u32
        };

        let uniforms = [
            gradient_map_enabled_value,
            self.material.gradient_map_count,
            self.material.gradient_map_index,
        ];

        surface_state
            .queue
            .write_buffer(&self.wgpu_material_uniforms_buffer, 0, bytemuck::cast_slice(&[uniforms]));
    }
}
