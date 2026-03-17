use crate::{SurfaceState, primitives::global_transform::GlobalTransform};
use engine_maths::{Matrix4, Perspective3, consts::Consts};

fn create_view_matrix(global_transform: &GlobalTransform) -> Matrix4<f32> {
    global_transform.similarity().isometry.inverse().to_homogeneous()
}

fn create_projection_matrix(fov: f32, near: f32, far: f32) -> Matrix4<f32> {
    let projection_matrix = *Perspective3::new(1.0, fov.to_radians(), near, far).as_matrix();
    Consts::OPENGL_TO_WGPU_MATRIX * projection_matrix
}

fn create_view_projection_matrix(view_matrix: Matrix4<f32>, projection_matrix: Matrix4<f32>) -> Matrix4<f32> {
    projection_matrix * view_matrix
}

#[derive(Debug)]
pub struct LightSpot {
    pub view_matrix: Matrix4<f32>,
    pub projection_matrix: Matrix4<f32>,
    pub view_projection_matrix: Matrix4<f32>,
    pub fov: f32,
    pub near: f32,
    pub far: f32,
    pub color: [f32; 3],
    pub intensity: f32,
    pub wgpu_buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
}

impl LightSpot {
    pub fn new(surface_state: &SurfaceState, fov: f32, near: f32, far: f32, color: [f32; 3], intensity: f32) -> LightSpot {
        let view_matrix = create_view_matrix(&GlobalTransform::default());
        let projection_matrix = create_projection_matrix(fov, near, far);
        let view_projection_matrix = create_view_projection_matrix(view_matrix, projection_matrix);

        let wgpu_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("LightSpot Buffer"),
            size: 256, // Min offset is 256 so we use that instead
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let bind_group_layout = surface_state.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("LightSpot Uniforms Bind Group Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("LightSpot Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu_buffer.as_entire_binding(),
            }],
        });

        LightSpot {
            view_matrix,
            projection_matrix,
            view_projection_matrix,
            fov,
            near,
            far,
            color,
            intensity,
            wgpu_buffer,
            bind_group,
        }
    }

    fn update_view_matrix(&mut self, global_transform: &GlobalTransform) {
        self.view_matrix = create_view_matrix(global_transform);
    }

    fn update_projection_matrix(&mut self) {
        self.projection_matrix = create_projection_matrix(self.fov, self.near, self.far);
    }

    pub fn update_view_projection_matrix(&mut self, global_transform: &GlobalTransform) {
        self.update_view_matrix(global_transform);
        self.update_projection_matrix();

        self.view_projection_matrix = create_view_projection_matrix(self.view_matrix, self.projection_matrix);
    }

    pub fn update_uniforms(&mut self, surface_state: &SurfaceState, global_transform: &GlobalTransform) {
        // View matrix
        surface_state
            .queue
            .write_buffer(&self.wgpu_buffer, 0, bytemuck::cast_slice(self.view_matrix.as_slice()));

        // Projection matrix
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            4 * 4 * 4,
            bytemuck::cast_slice(self.projection_matrix.as_slice()),
        );

        // View projection matrix
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4),
            bytemuck::cast_slice(self.view_projection_matrix.as_slice()),
        );

        // Position
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4),
            bytemuck::cast_slice(&[
                global_transform.similarity().isometry.translation.vector[0],
                global_transform.similarity().isometry.translation.vector[1],
                global_transform.similarity().isometry.translation.vector[2],
                1.0,
            ]),
        );

        // Near, Far, NaN, NaN
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4),
            bytemuck::cast_slice(&[self.near, self.far, 1.0, 1.0]),
        );

        // Color, Intensity
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4) + (4 * 4),
            bytemuck::cast_slice(&[self.color[0], self.color[1], self.color[2], self.intensity]),
        );
    }
}
