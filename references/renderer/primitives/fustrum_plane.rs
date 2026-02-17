use engine_maths::{Matrix4, Point3, Vector3};

#[derive(Debug)]
pub struct FrustumPlane {
    pub normal: Vector3<f32>,
    pub d: f32,
}

pub fn frustum_planes_from_matrix(view_projection_matrix: &Matrix4<f32>) -> [FrustumPlane; 6] {
    let mut planes = [
        // Left
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
        // Right
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
        // Bottom
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
        // Top
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
        // Near
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
        // Far
        FrustumPlane {
            normal: Vector3::zeros(),
            d: 0.0,
        },
    ];

    let row0 = view_projection_matrix.row(0);
    let row1 = view_projection_matrix.row(1);
    let row2 = view_projection_matrix.row(2);
    let row3 = view_projection_matrix.row(3);

    // Left: row3 + row0
    let p = (row3 + row0).transpose();
    planes[0] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Right: row3 - row0
    let p = (row3 - row0).transpose();
    planes[1] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Bottom: row3 + row1
    let p = (row3 + row1).transpose();
    planes[2] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Top: row3 - row1
    let p = (row3 - row1).transpose();
    planes[3] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Near: row3 + row2
    let p = (row3 + row2).transpose();
    planes[4] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Far: row3 - row2
    let p = (row3 - row2).transpose();
    planes[5] = FrustumPlane { normal: p.xyz(), d: p.w };

    // Normalize the planes
    for plane in planes.iter_mut() {
        let mag = plane.normal.magnitude();
        plane.normal /= mag;
        plane.d /= mag;
    }

    planes
}

pub fn aabb_in_frustum(aabb_min: &Point3<f32>, aabb_max: &Point3<f32>, planes: &[FrustumPlane; 6]) -> bool {
    for plane in planes {
        // For each plane, compute the most positive vertex (p-vertex) in the direction of the normal
        let mut p = Point3::new(
            if plane.normal.x >= 0.0 { aabb_max.x } else { aabb_min.x },
            if plane.normal.y >= 0.0 { aabb_max.y } else { aabb_min.y },
            if plane.normal.z >= 0.0 { aabb_max.z } else { aabb_min.z },
        );

        // Padding (TOOD: this means something is off in our calculations but this will do for now)
        let padding = 1.0;
        p += plane.normal * padding;

        // If p is outside the plane, the box is outside
        if plane.normal.dot(&p.coords) + plane.d < 0.0 {
            return false;
        }
    }
    true
}
