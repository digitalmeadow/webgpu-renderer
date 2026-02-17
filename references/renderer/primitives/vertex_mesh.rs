#[repr(C)]
#[derive(Copy, Clone, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
pub struct VertexMesh {
    pub position: [f32; 4],
    pub normal: [f32; 4],
    pub uv_coords: [f32; 2],
    pub joint_indices: [f32; 4],
    pub joint_weights: [f32; 4],
}

impl VertexMesh {
    const ATTRIBUTES: [wgpu::VertexAttribute; 5] = wgpu::vertex_attr_array![
        0 => Float32x4,
        1 => Float32x4,
        2 => Float32x2,
        3 => Float32x4,
        4 => Float32x4,
    ];

    pub fn buffer_layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<VertexMesh>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBUTES,
        }
    }
}
