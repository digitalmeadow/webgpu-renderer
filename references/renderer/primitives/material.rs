use engine_data::assets::gltf_model::GltfModel;
use engine_data::utils::get_asset_path;
use engine_data::{Primitive, material::AlphaMode};
use engine_ids::ResourceHandle;

use super::texture::Texture;
use super::texture_cube_map::TextureCubeMap;

#[derive(Debug, Clone)]
pub struct Material {
    pub albedo_texture: Option<Texture>,
    pub metalness_roughness_texture: Option<Texture>,
    pub environment_texture: Option<TextureCubeMap>,
    pub gradient_map_texture: Option<Texture>,
    pub gradient_map_enabled: bool,
    pub gradient_map_count: u32,
    pub gradient_map_index: u32,
    pub alpha_mode: AlphaMode,
    pub double_sided: bool,
}

impl Material {
    pub fn new_from_gltf_primitive(gltf_model: &GltfModel, primitive: &Primitive) -> Self {
        // Albedo
        let gltf_albedo_texture_info = primitive.material().pbr_metallic_roughness().base_color_texture();
        let mut albedo_texture: Option<Texture> = None;

        if let Some(texture) = gltf_albedo_texture_info {
            let gltf_albedo_texture = texture.texture();

            let image_source = gltf_albedo_texture.source().source();
            let image_handle: String;

            match image_source {
                engine_data::gltf_image::Source::Uri { uri, .. } => {
                    let path = gltf_model.file_path.join(uri);
                    image_handle = path.display().to_string();
                }
                _ => panic!("Unsupported image source"),
            };

            albedo_texture = Some(Texture::new_from_image_handle(ResourceHandle(image_handle)));
        }

        // Metalness and Roughness (metalness = B channel, roughness = G channel)
        let gltf_metalness_roughness_texture_info = primitive.material().pbr_metallic_roughness().metallic_roughness_texture();
        let mut metalness_roughness_texture: Option<Texture> = None;

        if let Some(texture) = gltf_metalness_roughness_texture_info {
            let gltf_metalness_roughness_texture = texture.texture();

            let image_source = gltf_metalness_roughness_texture.source().source();
            let image_handle: String;

            match image_source {
                engine_data::gltf_image::Source::Uri { uri, .. } => {
                    let path = gltf_model.file_path.join(uri);
                    image_handle = path.display().to_string();
                }
                _ => panic!("Unsupported image source"),
            };

            metalness_roughness_texture = Some(Texture::new_from_image_handle(ResourceHandle(image_handle)));
        }

        // Environment
        // TODO: Dynamic environments
        let environment_texture = Some(TextureCubeMap::new_from_folder_handle(ResourceHandle(
            get_asset_path("resources/export/environment/environment_default")
                .display()
                .to_string(),
        )));

        // Gradient map
        // Initialized as default, updated after initialisation in game code
        let gradient_map_texture = Some(Texture::new_from_image_handle(ResourceHandle(
            get_asset_path("resources/export/gradient_maps/")
                .join("gradient_map_default.jpg")
                .display()
                .to_string(),
        )));

        let alpha_mode = primitive.material().alpha_mode();
        let double_sided = primitive.material().double_sided();

        Self {
            albedo_texture,
            metalness_roughness_texture,
            environment_texture,
            gradient_map_texture,
            gradient_map_enabled: false,
            gradient_map_count: 1,
            gradient_map_index: 0,
            alpha_mode,
            double_sided,
        }
    }

    /// Update material to use a new gradient map post-initialisation
    /// Note: Mesh Bind Groups must now be recreated in order to create TextureView for the renderer
    pub fn add_gradient_map(&mut self, gradient_image_resource_handle: ResourceHandle, gradient_map_count: u32, gradient_map_index: u32) {
        self.gradient_map_texture = Some(Texture::new_from_image_handle(gradient_image_resource_handle));
        self.gradient_map_enabled = true;
        self.gradient_map_count = gradient_map_count;
        self.gradient_map_index = gradient_map_index;
    }
}
