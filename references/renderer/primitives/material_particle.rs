use engine_data::{errors::EngineDataError, material::AlphaMode, utils::get_asset_path};
use engine_ids::ResourceHandle;

use crate::primitives::texture::Texture;

use super::texture_atlas::TextureAtlas;

#[derive(Debug, Clone)]
pub struct MaterialParticle {
    pub texture_atlas: TextureAtlas,
    pub gradient_map_texture: Option<Texture>,
    pub gradient_map_enabled: bool,
    pub gradient_map_count: u32,
    pub alpha_mode: AlphaMode,
    pub double_sided: bool,
}

impl MaterialParticle {
    pub fn new_from_atlas_image(
        atlas_image_handle: &ResourceHandle,
        atlas_regions_handle: &ResourceHandle,
    ) -> Result<Self, EngineDataError> {
        let texture_atlas = TextureAtlas::new_from_image_handle(atlas_image_handle, atlas_regions_handle)?;

        // Gradient map
        // Initialized as default, updated after initialisation in game code
        let gradient_map_texture = Some(Texture::new_from_image_handle(ResourceHandle(
            get_asset_path("resources/export/gradient_maps/")
                .join("gradient_map_default.jpg")
                .display()
                .to_string(),
        )));

        let alpha_mode = AlphaMode::Blend;
        let double_sided = true;

        Ok(Self {
            texture_atlas,
            gradient_map_texture,
            gradient_map_enabled: false,
            gradient_map_count: 1,
            alpha_mode,
            double_sided,
        })
    }

    /// Update material to use a new gradient map post-initialisation
    /// Note: Mesh Bind Groups must now be recreated in order to create TextureView for the renderer
    pub fn add_gradient_map(&mut self, gradient_image_resource_handle: ResourceHandle, gradient_map_count: u32) {
        self.gradient_map_texture = Some(Texture::new_from_image_handle(gradient_image_resource_handle));
        self.gradient_map_enabled = true;
        self.gradient_map_count = gradient_map_count;
    }
}
