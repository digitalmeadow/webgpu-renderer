use engine_maths::{Matrix4, Perspective3, Point3, Vector4, consts::Consts};

use crate::{SurfaceState, errors::EngineGraphicsError, primitives::global_transform::GlobalTransform};

fn create_view_matrix(global_transform: &GlobalTransform) -> Matrix4<f32> {
    global_transform.similarity().isometry.inverse().to_homogeneous()
}

fn create_projection_matrix(aspect: f32, fov: f32, near: f32, far: f32) -> Matrix4<f32> {
    let projection_matrix = *Perspective3::new(aspect, fov.to_radians(), near, far).as_matrix();
    Consts::OPENGL_TO_WGPU_MATRIX * projection_matrix
}

fn create_view_projection_matrix(view_matrix: Matrix4<f32>, projection_matrix: Matrix4<f32>) -> Matrix4<f32> {
    projection_matrix * view_matrix
}

#[derive(Debug)]
pub struct PerspectiveCamera {
    pub view_matrix: Matrix4<f32>,
    pub projection_matrix: Matrix4<f32>,
    pub view_projection_matrix: Matrix4<f32>,
    pub projection_matrix_inverse: Matrix4<f32>,
    pub fov: f32,
    pub aspect: f32,
    pub near: f32,
    pub far: f32,
    pub wgpu_buffer: wgpu::Buffer,
    pub bind_group: wgpu::BindGroup,
}

impl PerspectiveCamera {
    pub fn bind_group_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Camera Uniforms Bind Group Layout"),
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
        })
    }

    pub fn new(surface_state: &SurfaceState, position: [f32; 3], target: [f32; 3], fov: f32, near: f32, far: f32) -> PerspectiveCamera {
        let aspect = surface_state.config.width as f32 / surface_state.config.height as f32;

        let global_transform = GlobalTransform::new_from_position_target(position, target);
        let view_matrix = create_view_matrix(&global_transform);
        let projection_matrix = create_projection_matrix(aspect, fov, near, far);
        let view_projection_matrix = create_view_projection_matrix(view_matrix, projection_matrix);
        let projection_matrix_inverse = projection_matrix.try_inverse().unwrap_or_default();

        let wgpu_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Camera Buffer"),
            size: 320,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = PerspectiveCamera::bind_group_layout(&surface_state.device);
        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Camera Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu_buffer.as_entire_binding(),
            }],
        });

        PerspectiveCamera {
            view_matrix,
            projection_matrix,
            view_projection_matrix,
            projection_matrix_inverse,
            fov,
            aspect,
            near,
            far,
            wgpu_buffer,
            bind_group,
        }
    }

    fn update_view_matrix(&mut self, global_transform: &GlobalTransform) {
        self.view_matrix = create_view_matrix(global_transform);
    }

    fn update_projection_matrix(&mut self) {
        self.projection_matrix = create_projection_matrix(self.aspect, self.fov, self.near, self.far);
        self.projection_matrix_inverse = self.projection_matrix.try_inverse().unwrap_or_default();
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

        // Projection matrix inverse
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4),
            bytemuck::cast_slice(self.projection_matrix_inverse.as_slice()),
        );

        // Position
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4),
            bytemuck::cast_slice(global_transform.similarity().isometry.translation.vector.as_slice()),
        );

        // TODO wrap into a single vec4
        // Near
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4),
            bytemuck::cast_slice(&[self.near]),
        );

        // Far
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4 * 4) + (4 * 4) + 4,
            bytemuck::cast_slice(&[self.far]),
        );
    }

    pub fn compute_view_frustum_corners_world_space_coordinates(&self) -> Result<[Point3<f32>; 8], EngineGraphicsError> {
        // The view frustum is in WGPU NDC [0, 1]
        // We use our view_projection_matrix to go between world space and NDC space (typically from world-space to NDC for rendering)
        // But in this instance we can go the other way
        let view_frustum_ndc = [
            // Near plane
            [-1.0, -1.0, 0.0],
            [1.0, -1.0, 0.0],
            [1.0, 1.0, 0.0],
            [-1.0, 1.0, 0.0],
            // Far plane
            [-1.0, -1.0, 1.0],
            [1.0, -1.0, 1.0],
            [1.0, 1.0, 1.0],
            [-1.0, 1.0, 1.0],
        ];

        let view_projection_matrix_inverse = self.view_projection_matrix.try_inverse().ok_or(EngineGraphicsError::RendererError(
            "View projection matrix non-invertable".to_string(),
        ))?;

        let mut corners = [Point3::origin(); 8];

        for (i, view_frustum_ndc_corner) in view_frustum_ndc.iter().enumerate() {
            let corner_vector_ndc = Vector4::new(
                view_frustum_ndc_corner[0],
                view_frustum_ndc_corner[1],
                view_frustum_ndc_corner[2],
                1.0,
            );
            let corner_vector_world_space_homogenous = view_projection_matrix_inverse * corner_vector_ndc;
            let corner_vector_world_space = corner_vector_world_space_homogenous.xyz() / corner_vector_world_space_homogenous.w;

            corners[i] = Point3::new(
                corner_vector_world_space.x,
                corner_vector_world_space.y,
                corner_vector_world_space.z,
            );
        }

        Ok(corners)
    }
}
