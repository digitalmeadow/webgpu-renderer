use std::path::PathBuf;

use engine::{EngineContext, errors::EngineError};

pub fn load_environment(context: &mut EngineContext, folder_handle: &PathBuf, file_name: &str) -> Result<(), EngineError> {
    context
        .data
        .load_cube_map_from_folder_handle(&mut context.id, folder_handle, file_name)?;

    Ok(())
}
