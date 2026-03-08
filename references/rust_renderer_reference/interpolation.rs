// https://github.com/dimforge/nalgebra/blob/dev/nalgebra-glm/src/common.rs

use nalgebra::{Point3, Translation3, UnitQuaternion, Vector3};

/// Safety range to prevent division by zero
const DIVISION_EPSILON: f32 = 1.0e-20;

/// Safely invert a value
pub fn invert(value: f32) -> f32 {
    if value.abs() < DIVISION_EPSILON { 0.0 } else { 1.0 / value }
}

/// Safely map a value from one range to another
pub fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        to_min
    } else {
        to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min)
    }
}

/// Positively wrap a number in a range
pub fn map_circular(value: f32, min: f32, max: f32) -> f32 {
    let range = max - min;
    ((value - min).rem_euclid(range)) + min
}

/// Constructs an exponential lerping value that lerps consistently across framerates
pub fn rate_independent_lerping_factor(rate: f32, dt: f32) -> f32 {
    1.0 - (-rate * dt).exp()
}

pub fn lerp_value(a: f32, b: f32, t: f32) -> f32 {
    map_range(t, 0.0, 1.0, a, b)
}

pub fn lerp_vector3(a: &Vector3<f32>, b: &Vector3<f32>, t: f32) -> Vector3<f32> {
    if a == b {
        return *a;
    }

    a.lerp(&b, t)
}

pub fn lerp_points(a: &Point3<f32>, b: &Point3<f32>, t: f32) -> Point3<f32> {
    if a == b {
        return *a;
    }

    a.lerp(b, t)
}

pub fn lerp_translation(a: &Translation3<f32>, b: &Translation3<f32>, t: f32) -> Translation3<f32> {
    if a == b {
        return *a;
    }

    a.vector.lerp(&b.vector, t).into()
}

pub fn lerp_rotation(a: &UnitQuaternion<f32>, b: &UnitQuaternion<f32>, t: f32) -> UnitQuaternion<f32> {
    if a == b {
        return *a;
    }

    a.slerp(b, t)
}

pub fn lerp_scale(a: f32, b: f32, t: f32) -> f32 {
    if a == b {
        return a;
    }

    lerp_value(a, b, t)
}
