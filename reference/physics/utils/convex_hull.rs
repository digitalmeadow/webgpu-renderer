use std::collections::{HashMap, HashSet};

use engine_data::{Primitive, assets::gltf_model::GltfModel};
use engine_maths::{Const, Isometry3, OPoint};

#[derive(Debug, Clone)]
pub struct ConvexHull {
    pub vertex_positions: Vec<OPoint<f32, Const<3>>>,
    pub vertex_indices: Vec<[u32; 3]>,
    pub position: Isometry3<f32>,
}

impl ConvexHull {
    pub fn new_from_gltf_primitive(gltf_model: &GltfModel, primitive: &Primitive, position: Isometry3<f32>) -> Self {
        let reader = primitive.reader(|buffer| Some(&gltf_model.buffer_data[buffer.index()]));

        let mut index_buffer: Vec<u32> = Vec::new();
        let mut vertex_positions_buffer: Vec<[f32; 4]> = Vec::new();

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

        // Nalgebra
        let vertex_positions: Vec<OPoint<f32, Const<3>>> = vertex_positions_buffer
            .iter()
            .map(|position| OPoint::from([position[0], position[1], position[2]]))
            .collect();

        let vertex_indices: Vec<[u32; 3]> = index_buffer.chunks(3).map(|chunk| [chunk[0], chunk[1], chunk[2]]).collect();

        let vertex_positions_check: Vec<[i32; 3]> = vertex_positions
            .iter()
            .map(|position| {
                [
                    (position.coords.x * 1_000_000.0) as i32,
                    (position.coords.y * 1_000_000.0) as i32,
                    (position.coords.z * 1_000_000.0) as i32,
                ]
            })
            .collect();

        if !Self::check_mesh(&vertex_positions_check, &vertex_indices) {
            panic!("Invalid mesh");
        }

        Self {
            vertex_positions,
            vertex_indices,
            position,
        }
    }

    fn check_mesh(vertices: &[[i32; 3]], indices: &[[u32; 3]]) -> bool {
        // Check for duplicate vertices
        let mut unique_vertices = HashSet::new();
        for vertex in vertices {
            if !unique_vertices.insert(vertex) {
                return false;
            }
        }

        // Check for closed shape
        let mut edge_count = HashMap::new();
        for triangle in indices {
            let edges = [(triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])];
            for &(v1, v2) in &edges {
                let edge = if v1 < v2 { (v1, v2) } else { (v2, v1) };
                *edge_count.entry(edge).or_insert(0) += 1;
            }
        }

        for (&_edge, &count) in &edge_count {
            if count != 2 {
                return false;
            }
        }

        true
    }
}
