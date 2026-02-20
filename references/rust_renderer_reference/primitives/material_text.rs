use engine_data::{errors::EngineDataError, material::AlphaMode};
use engine_ids::ResourceHandle;

use super::texture_atlas::TextureAtlas;

#[derive(Debug, Clone)]
pub struct MaterialText {
    pub texture_atlas: TextureAtlas,
    pub alpha_mode: AlphaMode,
    pub double_sided: bool,
}

impl MaterialText {
    pub fn new_from_atlas_image(
        atlas_image_handle: &ResourceHandle,
        atlas_regions_handle: &ResourceHandle,
    ) -> Result<Self, EngineDataError> {
        let texture_atlas = TextureAtlas::new_from_image_handle(atlas_image_handle, atlas_regions_handle)?;

        let alpha_mode = AlphaMode::Blend;
        let double_sided = true;

        Ok(Self {
            texture_atlas,
            alpha_mode,
            double_sided,
        })
    }
}
