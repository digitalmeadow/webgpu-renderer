use std::{error::Error, fmt};

#[derive(Debug)]
pub enum EngineAnimationError {
    GltfError(String),
    AnimationError(String),
}

impl fmt::Display for EngineAnimationError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            EngineAnimationError::GltfError(msg) => write!(f, "{}", msg),
            EngineAnimationError::AnimationError(msg) => write!(f, "{}", msg),
        }
    }
}

impl Error for EngineAnimationError {}
