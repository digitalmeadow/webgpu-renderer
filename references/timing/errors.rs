use std::{error::Error, fmt};

#[derive(Debug)]
pub enum EngineTimeError {
    TimeError(String),
}

impl fmt::Display for EngineTimeError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            EngineTimeError::TimeError(msg) => write!(f, "{}", msg),
        }
    }
}

impl Error for EngineTimeError {}
