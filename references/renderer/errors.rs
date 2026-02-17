use std::{error::Error, fmt};

#[derive(Debug)]
pub enum EngineGraphicsError {
    GltfError(String),
    RendererError(String),
    FileError(String, String),
}

impl fmt::Display for EngineGraphicsError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            EngineGraphicsError::GltfError(msg) => write!(f, "{}", msg),
            EngineGraphicsError::RendererError(msg) => write!(f, "{}", msg),
            EngineGraphicsError::FileError(msg, file) => write!(f, "{}: {}", msg, file),
        }
    }
}

impl Error for EngineGraphicsError {}
