use engine_maths::{Const, OPoint};

use crate::SurfaceState;
use crate::errors::EngineGraphicsError;
use crate::primitives::material_particle::MaterialParticle;
use crate::primitives::vertex_particle::VertexParticle;

#[derive(Debug, Clone)]
pub struct MeshParticle {
    pub id: String,
    // Components
    pub vertices: Vec<VertexParticle>,
    pub material: MaterialParticle,
    // Nalgebra
    pub vertex_positions: Vec<OPoint<f32, Const<3>>>,
    pub vertex_indices: Vec<[u32; 3]>,
    // Buffers
    pub wgpu_vertex_buffer: wgpu::Buffer,
    pub wgpu_index_buffer: wgpu::Buffer,
    pub wgpu_mesh_particle_uniforms_buffer: wgpu::Buffer,
    pub wgpu_material_uniforms_buffer: wgpu::Buffer,
    pub wgpu_draw_range: u32,
    // Bindings
    pub bind_group_for_particles_pass: Option<wgpu::BindGroup>,
}

impl MeshParticle {
    pub fn new(surface_state: &SurfaceState, id: &String, material: MaterialParticle) -> Result<Self, EngineGraphicsError> {
        let id = id.clone();

        // All particles share these default quad definitions
        let vertices = vec![
            VertexParticle {
                position: [-0.5, -0.5, 0.0, 1.0],
                normal: [0.0, 0.0, 1.0, 0.0],
                uv_coords: [0.0, 0.0],
            },
            VertexParticle {
                position: [0.5, -0.5, 0.0, 1.0],
                normal: [0.0, 0.0, 1.0, 0.0],
                uv_coords: [1.0, 0.0],
            },
            VertexParticle {
                position: [0.5, 0.5, 0.0, 1.0],
                normal: [0.0, 0.0, 1.0, 0.0],
                uv_coords: [1.0, 1.0],
            },
            VertexParticle {
                position: [-0.5, 0.5, 0.0, 1.0],
                normal: [0.0, 0.0, 1.0, 0.0],
                uv_coords: [0.0, 1.0],
            },
        ];
        let vertex_positions_buffer: Vec<[f32; 4]> = vertices
            .iter()
            .map(|vertex| [vertex.position[0], vertex.position[1], vertex.position[2], 1.0])
            .collect();
        let index_buffer = vec![0, 1, 2, 0, 2, 3];

        // [position.x, position.y, position.z, position.w, normal.x, normal.y ...]
        let mut vertex_buffer: Vec<f32> = Vec::new();

        for vertex in vertices.iter() {
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
        }

        // Print the vertex data
        // println!("Vertices: {:?}", vertices);
        // println!("Vertex indices: {:?}", index_buffer);
        // println!("Vertex buffer: {:?}", vertex_buffer);
        // println!("Vertex positions: {:?}", vertex_positions_buffer);

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

        let wgpu_mesh_particle_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("MeshParticle Uniforms Buffer"),
            // regions_x, regions_y, regions_total
            size: 4 + 4 + 4 as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_material_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Material Uniforms Buffer"),
            // gradient_map_enabled, gradient_map_count
            size: 4 + 4 as wgpu::BufferAddress,
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

        Ok(Self {
            id,
            vertices,
            material,
            vertex_positions,
            vertex_indices,
            wgpu_vertex_buffer,
            wgpu_index_buffer,
            wgpu_mesh_particle_uniforms_buffer,
            wgpu_material_uniforms_buffer,
            wgpu_draw_range: index_buffer.len() as u32,
            bind_group_for_particles_pass: None,
        })
    }

    // Uniform updates
    pub fn update_material_uniforms(&mut self, surface_state: &SurfaceState) {
        let gradient_map_enabled_value: u32 = if self.material.gradient_map_enabled {
            1.0 as u32
        } else {
            0.0 as u32
        };

        let uniforms = [gradient_map_enabled_value, self.material.gradient_map_count];

        surface_state
            .queue
            .write_buffer(&self.wgpu_material_uniforms_buffer, 0, bytemuck::cast_slice(&[uniforms]));
    }
}
