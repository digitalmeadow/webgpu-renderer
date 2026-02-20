use engine_data::DataContext;
use engine_maths::{Const, OPoint, Point2};

use crate::SurfaceState;
use crate::errors::EngineGraphicsError;

use super::material_text::MaterialText;
use super::vertex_text::VertexText;

#[derive(Debug, Clone)]
pub struct MeshText {
    pub id: String,
    // Components
    pub vertices: Vec<VertexText>,
    pub material: MaterialText,
    // Nalgebra
    pub vertex_positions: Vec<OPoint<f32, Const<2>>>,
    pub vertex_indices: Vec<[u32; 3]>,
    // Buffers
    pub wgpu_vertex_buffer: wgpu::Buffer,
    pub wgpu_index_buffer: wgpu::Buffer,
    pub wgpu_mesh_text_uniforms_buffer: wgpu::Buffer,
    pub wgpu_draw_range: u32,
    // Bindings
    pub bind_group_for_text_pass: Option<wgpu::BindGroup>,
    // Sizing parameters
    // Screen / Pixel Bounds for input and event handling
    pub bounds: [Point2<f32>; 2], // top-left, bottom-right
}

impl MeshText {
    pub fn new_from_string(
        surface_state: &SurfaceState,
        data_context: &DataContext,
        string: &str,
        id: &String,
        material: MaterialText,
    ) -> Result<Self, EngineGraphicsError> {
        let id = id.clone();

        let mut vertices = Vec::new();

        let mut index_buffer: Vec<u32> = Vec::new();
        let mut vertex_positions_buffer: Vec<[f32; 2]> = Vec::new();

        // [position.x, position.y, uv.x, uv.y, ...]
        let mut vertex_buffer: Vec<f32> = Vec::new();

        let atlas_image_id = &data_context.handles[&material.texture_atlas.image_handle];
        let atlas_image = data_context
            .get_image(&atlas_image_id)
            .map_err(|e| EngineGraphicsError::FileError("Atlas image not found".to_string(), e.to_string()))?;

        let atlas_region_character_map_id = &data_context.handles[&material.texture_atlas.atlas_regions_handle];
        let atlas_region_character_map = data_context
            .get_atlas_region_character_map(&atlas_region_character_map_id)
            .map_err(|e| EngineGraphicsError::FileError("Atlas regions character map not found".to_string(), e.to_string()))?;

        let atlas_width = atlas_image.dimensions.0 as f32;
        let atlas_height = atlas_image.dimensions.1 as f32;
        let mut cursor_x = 0.0;
        let cursor_y = 0.0;

        // Bounds
        let mut bounds_x_min = surface_state.config.width as f32;
        let mut bounds_x_max = 0.0 as f32;
        let mut bounds_y_min = surface_state.config.height as f32;
        let mut bounds_y_max = 0.0 as f32;

        let mut index_offset = 0;

        // Compute vertex indicies and positions
        for character in string.chars() {
            if let Some(region) = atlas_region_character_map.0.get(&character) {
                let x_left = cursor_x + region.offset_x.unwrap_or(0.0);
                let x_right = x_left + region.width;
                let y_top = cursor_y + region.offset_y.unwrap_or(0.0);
                let y_bottom = y_top + region.height;

                // Update bounds
                bounds_x_min = bounds_x_min.min(x_left);
                bounds_x_max = bounds_x_max.max(x_right);
                bounds_y_min = bounds_y_min.min(y_top); // y_top is the smaller value since [0, 0] = top-left
                bounds_y_max = bounds_y_max.max(y_bottom);

                // Advance cursor
                cursor_x += region.advance_x.unwrap_or(region.width);

                // Compute UVs (normalized)
                let u0 = region.x / atlas_width;
                let v0 = region.y / atlas_height;
                let u1 = (region.x + region.width) / atlas_width;
                let v1 = (region.y + region.height) / atlas_height;

                // 4 vertices per quad
                let quad_vertices = [
                    VertexText {
                        position: [x_left, y_top],
                        uv_coords: [u0, v0],
                    },
                    VertexText {
                        position: [x_right, y_top],
                        uv_coords: [u1, v0],
                    },
                    VertexText {
                        position: [x_right, y_bottom],
                        uv_coords: [u1, v1],
                    },
                    VertexText {
                        position: [x_left, y_bottom],
                        uv_coords: [u0, v1],
                    },
                ];
                vertices.extend_from_slice(&quad_vertices);

                for vertex in quad_vertices {
                    // Fill vertex buffer
                    vertex_buffer.push(vertex.position[0]);
                    vertex_buffer.push(vertex.position[1]);
                    vertex_buffer.push(vertex.uv_coords[0]);
                    vertex_buffer.push(vertex.uv_coords[1]);

                    // Fill vertex positions buffer (for nalgebra)
                    vertex_positions_buffer.push([vertex.position[0], vertex.position[1]]);
                }

                // Fill index buffer with 2 triangles per quad
                index_buffer.extend_from_slice(&[
                    index_offset,
                    index_offset + 1,
                    index_offset + 2,
                    index_offset,
                    index_offset + 2,
                    index_offset + 3,
                ]);
                index_offset += 4;
            }
        }

        // Print the vertex data_context
        // println!("Vertices: {:?}", vertices);
        // println!("Vertex indices: {:?}", index_buffer);
        // println!("Vertex buffer: {:?}", vertex_buffer);
        // println!("Vertex positions: {:?}", vertex_positions_buffer);

        // Nalgebra
        let vertex_positions: Vec<OPoint<f32, Const<2>>> = vertex_positions_buffer
            .iter()
            .map(|position| OPoint::from([position[0], position[1]]))
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

        let wgpu_mesh_text_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("MeshText Uniforms Buffer"),
            // state: [is_hovered, is_focused, is_active, is_disabled]
            size: 4 as wgpu::BufferAddress,
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
            wgpu_mesh_text_uniforms_buffer,
            wgpu_draw_range: index_buffer.len() as u32,
            bind_group_for_text_pass: None,
            bounds: [Point2::new(bounds_x_min, bounds_y_min), Point2::new(bounds_x_max, bounds_y_max)],
        })
    }

    pub fn update_state(&mut self, surface_state: &SurfaceState, is_hovered: bool, is_focused: bool, is_active: bool, is_disabled: bool) {
        let state = (is_hovered as u32) << 0 | (is_focused as u32) << 1 | (is_active as u32) << 2 | (is_disabled as u32) << 3;

        surface_state
            .queue
            .write_buffer(&self.wgpu_mesh_text_uniforms_buffer, 0, bytemuck::cast_slice(&[state]));
    }
}
