use engine_data::assets::image::Image;
use engine_ids::ResourceHandle;
use wgpu::{TextureViewDescriptor, TextureViewDimension};

use crate::SurfaceState;

#[derive(Debug, Clone)]
pub struct TextureCubeMap {
    pub folder_handle: ResourceHandle,
    pub view: Option<wgpu::TextureView>,
}

impl TextureCubeMap {
    pub fn new_from_folder_handle(folder_handle: ResourceHandle) -> Self {
        Self { folder_handle, view: None }
    }

    pub fn create_view(&mut self, surface_state: &SurfaceState, images_high_res: &[&Image], images_low_res: &[&Image]) {
        // Create texture
        let texture = surface_state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Texture Cube Map"),
            size: wgpu::Extent3d {
                width: images_high_res[0].dimensions.0,
                height: images_high_res[0].dimensions.1,
                depth_or_array_layers: 6,
            },
            mip_level_count: 4, // [high-res 512] [skipped-level 256] [skipped-level 128] [low-res 64] textures are supplied to control sharpness of reflections
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &surface_state.config.view_formats,
        });

        // Write texture data for each face
        // High res
        for (i, image) in images_high_res.iter().enumerate() {
            surface_state.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d {
                        x: 0,
                        y: 0,
                        z: i as u32, // Face index
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                &image.buffer,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4 * image.dimensions.0),
                    rows_per_image: Some(image.dimensions.1),
                },
                wgpu::Extent3d {
                    width: image.dimensions.0,
                    height: image.dimensions.1,
                    depth_or_array_layers: 1,
                },
            );
        }

        // Low res
        for (i, image) in images_low_res.iter().enumerate() {
            surface_state.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 3,
                    origin: wgpu::Origin3d {
                        x: 0,
                        y: 0,
                        z: i as u32, // Face index
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                &image.buffer,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4 * image.dimensions.0),
                    rows_per_image: Some(image.dimensions.1),
                },
                wgpu::Extent3d {
                    width: image.dimensions.0,
                    height: image.dimensions.1,
                    depth_or_array_layers: 1,
                },
            );
        }

        let texture_view_descriptor = TextureViewDescriptor {
            dimension: Some(TextureViewDimension::Cube),
            ..Default::default()
        };

        let view = texture.create_view(&texture_view_descriptor);

        self.view = Some(view);
    }
}
