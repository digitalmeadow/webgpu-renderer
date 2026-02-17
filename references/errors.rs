use std::{error::Error, fmt};

use engine_animations::errors::EngineAnimationError;
use engine_audio::errors::EngineAudioError;
use engine_data::errors::EngineDataError;
use engine_graphics::errors::EngineGraphicsError;
use engine_inputs::errors::EngineInputsError;
use engine_maths::errors::EngineMathsError;
use engine_physics::errors::EnginePhysicsError;
use engine_timing::errors::EngineTimeError;
use engine_ui::errors::EngineUiError;
use engine_world::errors::EngineWorldError;

#[derive(Debug)]
pub enum EngineError {
    EngineInputError(EngineInputsError),
    EngineAnimationError(EngineAnimationError),
    EngineDataError(EngineDataError),
    EngineGraphicsError(EngineGraphicsError),
    EngineMathsError(EngineMathsError),
    EnginePhysicsError(EnginePhysicsError),
    EngineWorldError(EngineWorldError),
    EngineUiError(EngineUiError),
    EngineAudioError(EngineAudioError),
    EngineTimeError(EngineTimeError),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            EngineError::EngineInputError(msg) => write!(f, "{}", msg),
            EngineError::EngineAnimationError(msg) => write!(f, "{}", msg),
            EngineError::EngineDataError(msg) => write!(f, "{}", msg),
            EngineError::EngineGraphicsError(msg) => write!(f, "{}", msg),
            EngineError::EngineMathsError(msg) => write!(f, "{}", msg),
            EngineError::EnginePhysicsError(msg) => write!(f, "{}", msg),
            EngineError::EngineWorldError(msg) => write!(f, "{}", msg),
            EngineError::EngineUiError(msg) => write!(f, "{}", msg),
            EngineError::EngineAudioError(msg) => write!(f, "{}", msg),
            EngineError::EngineTimeError(msg) => write!(f, "{}", msg),
        }
    }
}

impl Error for EngineError {}

impl From<EngineInputsError> for EngineError {
    fn from(err: EngineInputsError) -> EngineError {
        EngineError::EngineInputError(err)
    }
}

impl From<EngineAnimationError> for EngineError {
    fn from(err: EngineAnimationError) -> EngineError {
        EngineError::EngineAnimationError(err)
    }
}

impl From<EngineDataError> for EngineError {
    fn from(err: EngineDataError) -> EngineError {
        EngineError::EngineDataError(err)
    }
}

impl From<EngineGraphicsError> for EngineError {
    fn from(err: EngineGraphicsError) -> EngineError {
        EngineError::EngineGraphicsError(err)
    }
}

impl From<EngineMathsError> for EngineError {
    fn from(err: EngineMathsError) -> EngineError {
        EngineError::EngineMathsError(err)
    }
}

impl From<EnginePhysicsError> for EngineError {
    fn from(err: EnginePhysicsError) -> EngineError {
        EngineError::EnginePhysicsError(err)
    }
}

impl From<EngineWorldError> for EngineError {
    fn from(err: EngineWorldError) -> EngineError {
        EngineError::EngineWorldError(err)
    }
}

impl From<EngineUiError> for EngineError {
    fn from(err: EngineUiError) -> EngineError {
        EngineError::EngineUiError(err)
    }
}

impl From<EngineAudioError> for EngineError {
    fn from(err: EngineAudioError) -> EngineError {
        EngineError::EngineAudioError(err)
    }
}

impl From<EngineTimeError> for EngineError {
    fn from(err: EngineTimeError) -> EngineError {
        EngineError::EngineTimeError(err)
    }
}
