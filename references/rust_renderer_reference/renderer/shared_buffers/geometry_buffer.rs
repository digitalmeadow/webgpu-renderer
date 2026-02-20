use wgpu::{BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, Sampler, ShaderStages, Texture, TextureView};

use crate::SurfaceState;

#[derive(Debug)]
pub struct GeometryBuffer {
    pub sampler_linear: Sampler,
    albedo_metalness_texture: Texture,
    pub albedo_metalness_view: TextureView,
    normal_roughness_texture: Texture,
    pub normal_roughness_view: TextureView,
    depth_texture: Texture,
    pub depth_view: TextureView,
    pub bind_group_layout: BindGroupLayout,
    pub bind_group: BindGroup,
}

impl GeometryBuffer {
    pub fn new(surface_state: &SurfaceState, render_width: Option<u32>, render_height: Option<u32>) -> Self {
        let sampler_linear = surface_state.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("GeometryBuffer Linear (Filtering) Sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });

        // Albedo + Metalness
        let albedo_metalness_texture = surface_state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("GeometryBuffer Albedo+Metalness Texture"),
            size: wgpu::Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb, // Or Rgba16Float for HDR
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let albedo_metalness_view = albedo_metalness_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Normal + Roughenss
        let normal_roughness_texture = surface_state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("GeometryBuffer Normal+Roughness Texture"),
            size: wgpu::Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let normal_roughness_view = normal_roughness_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Depth
        let depth_texture = surface_state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("GeometryBuffer Depth Texture"),
            size: wgpu::Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let depth_view = depth_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Geometry buffer containing all information needed for the next rendering passes (deferred rendering)
        let bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("GeometryBuffer Bind Group Layout"),
            entries: &[
                // Sampler linear
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                // Albedo (rgb) + Metalness (a)
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Normal (rg) + Roughness (a)
                BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Depth
                // TODO: Export this bindgrouplayoutentry so we can import it into other passes that use it (one source of truth)
                BindGroupLayoutEntry {
                    binding: 3,
                    visibility: ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Depth,
                    },
                    count: None,
                },
            ],
        });

        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("GeometryBuffer Bind Group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&albedo_metalness_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&normal_roughness_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&depth_view),
                },
            ],
        });

        Self {
            sampler_linear,
            albedo_metalness_texture,
            albedo_metalness_view,
            normal_roughness_texture,
            normal_roughness_view,
            depth_texture,
            depth_view,
            bind_group_layout,
            bind_group,
        }
    }
}
