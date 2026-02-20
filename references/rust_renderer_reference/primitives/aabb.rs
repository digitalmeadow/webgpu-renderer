use engine_maths::{Const, OPoint, Point3};

use crate::primitives::global_transform::GlobalTransform;

#[derive(Debug, Clone)]
pub struct AABB {
    // Model space
    pub min: Point3<f32>,
    pub max: Point3<f32>,
    pub corners: [Point3<f32>; 8],
    // World space
    pub min_ws: Point3<f32>,
    pub max_ws: Point3<f32>,
    pub corners_ws: [Point3<f32>; 8],
    // Desc
    pub frustum_cull: bool,
}

impl AABB {
    pub fn new_from_vertex_positions(vertex_positions: &Vec<OPoint<f32, Const<3>>>, frustum_cull: bool) -> Self {
        let mut min = Point3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let mut max = Point3::new(f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY);

        for pos in vertex_positions {
            min.x = min.x.min(pos.x);
            min.y = min.y.min(pos.y);
            min.z = min.z.min(pos.z);

            max.x = max.x.max(pos.x);
            max.y = max.y.max(pos.y);
            max.z = max.z.max(pos.z);
        }

        let corners = [
            Point3::new(min.x, min.y, min.z),
            Point3::new(max.x, min.y, min.z),
            Point3::new(max.x, max.y, min.z),
            Point3::new(min.x, max.y, min.z),
            Point3::new(min.x, min.y, max.z),
            Point3::new(max.x, min.y, max.z),
            Point3::new(max.x, max.y, max.z),
            Point3::new(min.x, max.y, max.z),
        ];

        AABB {
            min,
            max,
            corners,
            min_ws: min,         // ws updated during render by the engine system
            max_ws: max,         // ws updated during render by the engine system
            corners_ws: corners, // ws updated during render by the engine system
            frustum_cull,
        }
    }

    /// Updates the AABB ws using a GlobalTransform
    pub fn update(&mut self, global_transform: &GlobalTransform) {
        let mut min_ws = Point3::new(f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let mut max_ws = Point3::new(f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY);

        for corner in &self.corners {
            let corner_ws = global_transform.matrix().transform_point(corner);

            min_ws.x = min_ws.x.min(corner_ws.x);
            min_ws.y = min_ws.y.min(corner_ws.y);
            min_ws.z = min_ws.z.min(corner_ws.z);

            max_ws.x = max_ws.x.max(corner_ws.x);
            max_ws.y = max_ws.y.max(corner_ws.y);
            max_ws.z = max_ws.z.max(corner_ws.z);
        }

        let corners_ws = [
            Point3::new(min_ws.x, min_ws.y, min_ws.z),
            Point3::new(max_ws.x, min_ws.y, min_ws.z),
            Point3::new(max_ws.x, max_ws.y, min_ws.z),
            Point3::new(min_ws.x, max_ws.y, min_ws.z),
            Point3::new(min_ws.x, min_ws.y, max_ws.z),
            Point3::new(max_ws.x, min_ws.y, max_ws.z),
            Point3::new(max_ws.x, max_ws.y, max_ws.z),
            Point3::new(min_ws.x, max_ws.y, max_ws.z),
        ];

        self.min_ws = min_ws;
        self.max_ws = max_ws;
        self.corners_ws = corners_ws;
    }
}
