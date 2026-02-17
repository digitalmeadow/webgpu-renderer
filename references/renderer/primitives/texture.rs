use engine_data::assets::image::Image;
use engine_ids::ResourceHandle;

use crate::SurfaceState;

#[derive(Debug, Clone)]
pub struct Texture {
    pub image_handle: ResourceHandle,
    pub view: Option<wgpu::TextureView>,
}

impl Texture {
    pub fn new_from_image_handle(image_handle: ResourceHandle) -> Self {
        Self { image_handle, view: None }
    }

    pub fn create_view(&mut self, surface_state: &SurfaceState, image: &Image) {
        // Create texture
        let texture = surface_state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Texture"),
            size: wgpu::Extent3d {
                width: image.dimensions.0,
                height: image.dimensions.1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &surface_state.config.view_formats,
        });

        // Write texture data
        surface_state.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
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

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());

        self.view = Some(view);
    }
}
