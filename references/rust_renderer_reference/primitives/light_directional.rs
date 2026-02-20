use engine_maths::{
    Matrix4, Orthographic3, Point3, UnitVector3, Vector3,
    consts::Consts,
    interpolation::{lerp_points, map_range},
};
use wgpu::BufferAddress;

use crate::SurfaceState;

pub const SHADOW_MAP_CASCADES_COUNT: usize = 3;
pub const SHADOW_CASCADE_SPLITS: [f32; SHADOW_MAP_CASCADES_COUNT + 1] = [0.0, 0.2, 0.5, 1.0];
pub const LIGHT_VIEW_OFFSET: f32 = 50.0; // Distance at which vertices will be clipped, typically set to large enough to avoid clipping any vertices between camera and light

fn create_view_matrix(center_point: &Point3<f32>, light_direction: &UnitVector3<f32>, frustum_radius: f32) -> Matrix4<f32> {
    let eye = center_point - light_direction.into_inner() * (frustum_radius + LIGHT_VIEW_OFFSET);
    let target = center_point;
    Matrix4::look_at_rh(&eye, &target, &Vector3::z_axis())
}

fn create_projection_matrix(bounds_min: &Point3<f32>, bounds_max: &Point3<f32>) -> Matrix4<f32> {
    let projection_matrix =
        *Orthographic3::new(bounds_min.x, bounds_max.x, bounds_min.y, bounds_max.y, -bounds_max.z, -bounds_min.z).as_matrix();
    Consts::OPENGL_TO_WGPU_MATRIX * projection_matrix
}

fn create_view_projection_matrix(view_matrix: Matrix4<f32>, projection_matrix: Matrix4<f32>) -> Matrix4<f32> {
    projection_matrix * view_matrix
}

#[derive(Debug)]
pub struct LightDirectional {
    pub view_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT],
    pub projection_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT],
    pub view_projection_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT],
    pub cascade_splits: [f32; SHADOW_MAP_CASCADES_COUNT + 1], // start/end of each cascade
    pub color: [f32; 3],
    pub intensity: f32,
    pub direction: UnitVector3<f32>,
    pub wgpu_buffer: wgpu::Buffer,   // contains all lights (lighting_pass)
    pub bind_group: wgpu::BindGroup, // contains all lights (lighting_pass)
}

impl LightDirectional {
    pub fn new(surface_state: &SurfaceState, direction: &UnitVector3<f32>, color: [f32; 3], intensity: f32) -> LightDirectional {
        // These are just placeholder initial values (updated to camera frustum later)
        let center = Point3::default();
        let bounds_min = Point3::new(-1.0, -1.0, -1.0);
        let bounds_max = Point3::new(1.0, 1.0, 1.0);
        let fustrum_radius = 1.0;

        let view_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT] =
            std::array::from_fn(|_| create_view_matrix(&center, direction, fustrum_radius));
        let projection_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT] =
            std::array::from_fn(|_| create_projection_matrix(&bounds_min, &bounds_max));
        let view_projection_matrices: [Matrix4<f32>; SHADOW_MAP_CASCADES_COUNT] =
            std::array::from_fn(|i| create_view_projection_matrix(view_matrices[i], projection_matrices[i]));

        let wgpu_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("LightDirectional Buffer"),
            // view_projection_matrices, cascade_splits, direction, active_view_projection_index (shadow_pass only)
            // size: SHADOW_MAP_CASCADES_COUNT * (4 * 4 * 4) + (4 * 4) + (4 * 4) + 4
            size: 256, // Min offset is 256 so we use that instead
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let bind_group_layout = surface_state.device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("LightDirectional Bind Group Layout"),
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
            label: Some("LightDirectional Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu_buffer.as_entire_binding(),
            }],
        });

        LightDirectional {
            view_matrices,
            projection_matrices,
            view_projection_matrices,
            color,
            intensity,
            direction: *direction,
            cascade_splits: SHADOW_CASCADE_SPLITS,
            wgpu_buffer,
            bind_group,
        }
    }

    fn update_view_matrix(&mut self, cascade_index: usize, center_point: &Point3<f32>, frustum_radius: f32) {
        assert!(cascade_index < SHADOW_MAP_CASCADES_COUNT, "Cascade index out of range");
        self.view_matrices[cascade_index] = create_view_matrix(center_point, &self.direction, frustum_radius);
    }

    fn update_projection_matrix(&mut self, index: usize, bounds_min: &Point3<f32>, bounds_max: &Point3<f32>) {
        assert!(index < SHADOW_MAP_CASCADES_COUNT, "Cascade index out of range");
        self.projection_matrices[index] = create_projection_matrix(bounds_min, bounds_max);
    }

    pub fn update_view_projection_matrix(&mut self, index: usize, bounds_min: &Point3<f32>, bounds_max: &Point3<f32>) {
        assert!(index < SHADOW_MAP_CASCADES_COUNT, "Cascade index out of range");
        self.update_projection_matrix(index, bounds_min, bounds_max);
        self.view_projection_matrices[index] = self.projection_matrices[index] * self.view_matrices[index];
    }

    pub fn update_cascade_splits(&mut self, camera_near: f32, camera_far: f32) {
        for i in 0..SHADOW_MAP_CASCADES_COUNT + 1 {
            let cascade_split = map_range(SHADOW_CASCADE_SPLITS[i], 0.0, 1.0, camera_near, camera_far);
            assert!(cascade_split >= camera_near && cascade_split <= camera_far, "Cascade out of range");
            self.cascade_splits[i] = cascade_split;
        }
    }

    fn update_view_projection_matrix_from_camera_frustum_corners(
        &mut self,
        cascade_index: usize,
        camera_frustum_corners: &[Point3<f32>; 8],
    ) {
        // Calculate the center of the frustum
        let center_point = camera_frustum_corners.iter().fold(Point3::default(), |acc, p| acc + p.coords) / 8.0;

        // Calculate the bounding sphere radius for the frustum (for eye distance)
        let frustum_radius = camera_frustum_corners.iter().map(|p| (p - center_point).norm()).fold(0.0, f32::max);
        self.update_view_matrix(cascade_index, &center_point, frustum_radius);

        // Extrude each frustum corner toward the light source by LIGHT_VIEW_OFFSET.
        let light_dir = self.direction.into_inner();
        let extruded_world_corners: Vec<Point3<f32>> = camera_frustum_corners.iter().map(|p| *p - light_dir * LIGHT_VIEW_OFFSET).collect();

        // Combine original + extruded
        let mut all_world_corners: Vec<Point3<f32>> = Vec::with_capacity(camera_frustum_corners.len() * 2);
        all_world_corners.extend_from_slice(camera_frustum_corners);
        all_world_corners.extend(extruded_world_corners);

        // Transform all corners into light space
        let light_space_corners: Vec<Point3<f32>> = all_world_corners
            .iter()
            .map(|p| self.view_matrices[cascade_index].transform_point(p))
            .collect();

        // Fit AABB
        let (mut bounds_min, mut bounds_max) = (light_space_corners[0], light_space_corners[0]);
        for point in &light_space_corners[1..] {
            bounds_min = bounds_min.inf(point);
            bounds_max = bounds_max.sup(point);
        }

        self.update_projection_matrix(cascade_index, &bounds_min, &bounds_max);
        self.update_view_projection_matrix(cascade_index, &bounds_min, &bounds_max);
    }

    pub fn update_view_projection_matrices_from_camera_frustum_corners(&mut self, camera_frustum_corners: &[Point3<f32>; 8]) {
        // camera_frustum_corners: [near0, near1, near2, near3, far0, far1, far2, far3]
        // cascade_splits: [near, split1, split2, far]
        // For each cascade, interpolate between near and far corners
        let split_range = self.cascade_splits[SHADOW_MAP_CASCADES_COUNT] - self.cascade_splits[0];

        for cascade_index in 0..SHADOW_MAP_CASCADES_COUNT {
            let split_near = self.cascade_splits[cascade_index];
            let split_far = self.cascade_splits[cascade_index + 1];

            let t_near = (split_near - self.cascade_splits[0]) / split_range;
            let t_far = (split_far - self.cascade_splits[0]) / split_range;

            let mut split_corners = [Point3::origin(); 8];

            for corner_index in 0..4 {
                let near_corner = camera_frustum_corners[corner_index];
                let far_corner = camera_frustum_corners[corner_index + 4];

                split_corners[corner_index] = lerp_points(&near_corner, &far_corner, t_near);
                split_corners[corner_index + 4] = lerp_points(&near_corner, &far_corner, t_far);
            }

            self.update_view_projection_matrix_from_camera_frustum_corners(cascade_index, &split_corners);
        }
    }

    pub fn update_uniforms(&mut self, surface_state: &SurfaceState) {
        let matrices_flat: Vec<f32> = self
            .view_projection_matrices
            .iter()
            .flat_map(|m| m.as_slice().iter().copied())
            .collect();

        // Write all matrices at offset 0
        surface_state
            .queue
            .write_buffer(&self.wgpu_buffer, 0, bytemuck::cast_slice(&matrices_flat));

        // Write cascade splits after the matrices (offset = 3 matrices * 16 floats * 4 bytes)
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (SHADOW_MAP_CASCADES_COUNT * (4 * 4 * 4)) as BufferAddress,
            bytemuck::cast_slice(&self.cascade_splits.as_slice()),
        );

        // Write direction
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (SHADOW_MAP_CASCADES_COUNT * (4 * 4 * 4) + (4 * 4)) as BufferAddress,
            bytemuck::cast_slice(&[self.direction.x, self.direction.y, self.direction.z, 0.0]),
        );

        // Write color (use intensity in the free slot)
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (SHADOW_MAP_CASCADES_COUNT * (4 * 4 * 4) + (4 * 4) + (4 * 4)) as BufferAddress,
            bytemuck::cast_slice(&[self.color[0], self.color[1], self.color[2], self.intensity]),
        );

        // Leave active view projection index to be set explicitly in render loops
    }

    pub fn update_uniforms_active_view_projection_index(&mut self, surface_state: &SurfaceState, active_view_projection_index: u32) {
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            (SHADOW_MAP_CASCADES_COUNT * (4 * 4 * 4) + (4 * 4) + (4 * 4) + (4 * 4)) as BufferAddress, // offset must also be 4-byte aligned
            bytemuck::cast_slice(&[active_view_projection_index]),
        );
    }
}
