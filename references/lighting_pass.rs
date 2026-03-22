use engine_world::QueryBorrow;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, Buffer, Color, ColorTargetState, ColorWrites,
    CommandEncoder, CommandEncoderDescriptor, Extent3d, FragmentState, LoadOp, MultisampleState, Operations, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp, SurfaceError, Texture,
    TextureDescriptor, TextureDimension, TextureUsages, TextureView, TextureViewDescriptor, VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    primitives::{camera::PerspectiveCamera, light_directional::LightDirectional, light_spot::LightSpot},
    renderer::{
        passes::{shadow_pass_directional::MAX_LIGHT_DIRECTIONAL_COUNT, shadow_pass_spot::MAX_LIGHT_SPOT_COUNT},
        shared_buffers::{context_buffer::ContextBuffer, geometry_buffer::GeometryBuffer},
    },
};

pub struct LightingPass {
    pub lighting_pass_bind_group_layout: BindGroupLayout,
    pub lighting_pass_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    pub wgpu_light_directional_uniforms_buffer: Buffer,
    pub wgpu_light_spot_uniforms_buffer: Buffer,
    pub sampler_linear: Sampler,
    pub sampler_comparison: Sampler,
    output_color_texture: Texture,
    pub output_color_view: TextureView,
}

impl LightingPass {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        geometry_buffer: &GeometryBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("lighting_pass.wgsl"));

        let lighting_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Lighting Pass Uniforms Bind Group Layout"),
            entries: &[
                // Sampler Linear
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Sampler Comparison (Shadows)
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Comparison),
                    count: None,
                },
                // LightDirectionals
                BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // LightDirectional Shadow Texture Array
                BindGroupLayoutEntry {
                    binding: 3,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                    },
                    count: None,
                },
                // LightSpots
                BindGroupLayoutEntry {
                    binding: 4,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // LightSpot Shadow Texture Array
                BindGroupLayoutEntry {
                    binding: 5,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                    },
                    count: None,
                },
            ],
        });

        let wgpu_light_directional_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Directional Uniforms Buffer"),
            // Size of an array of LightsDirectional, with a size of MAX_LIGHT_DIRECTIONAL_COUNT
            size: 256 * MAX_LIGHT_DIRECTIONAL_COUNT as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_light_spot_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Light Spot Uniforms Buffer"),
            // Size of an array of LightSpot, with a size of MAX_LIGHT_SPOT_COUNT
            size: 256 * MAX_LIGHT_SPOT_COUNT as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[
                &context_buffer.bind_group_layout,                            // 0
                &geometry_buffer.bind_group_layout,                           // 1
                &PerspectiveCamera::bind_group_layout(&surface_state.device), // 2
                &lighting_pass_bind_group_layout,                             // 3
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Lighting Pass Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: PipelineCompilationOptions::default(),
            },
            fragment: Some(FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(ColorTargetState {
                    format: surface_state.config.format,
                    blend: None,
                    write_mask: ColorWrites::ALL,
                })],
                compilation_options: PipelineCompilationOptions::default(),
            }),
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                cull_mode: Some(wgpu::Face::Back),

                ..Default::default()
            },
            depth_stencil: None,
            multisample: MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview_mask: None,
            cache: None,
        });

        let sampler_linear = surface_state.device.create_sampler(&SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });

        let sampler_comparison = surface_state.device.create_sampler(&SamplerDescriptor {
            label: Some("Sampler Comparison (Shadows)"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });

        let output_color_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Lighting Pass Output Color Render Texture"),
            size: Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: surface_state.config.format,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });

        let output_color_view = output_color_texture.create_view(&TextureViewDescriptor::default());

        return {
            Self {
                lighting_pass_bind_group_layout,
                wgpu_light_directional_uniforms_buffer,
                wgpu_light_spot_uniforms_buffer,
                lighting_pass_bind_group: None,
                render_pipeline,
                sampler_linear,
                sampler_comparison,
                output_color_texture,
                output_color_view,
            }
        };
    }

    // pub fn resize(&mut self, surface_state: &SurfaceState) {}

    pub fn update_bind_groups(
        &mut self,
        surface_state: &SurfaceState,
        light_directional_shadow_texture_array_view: &TextureView,
        light_spot_shadow_texture_array_view: &TextureView,
    ) {
        // Lighting uniforms
        let lighting_pass_bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Lighting Uniforms Bind Group"),
            layout: &self.lighting_pass_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_comparison),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.wgpu_light_directional_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&light_directional_shadow_texture_array_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: self.wgpu_light_spot_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(&light_spot_shadow_texture_array_view),
                },
            ],
        });

        self.lighting_pass_bind_group = Some(lighting_pass_bind_group);
    }

    pub fn update_bind_group_buffers(
        &mut self,
        encoder: &mut CommandEncoder,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        lights_spots_query: &mut QueryBorrow<'_, &mut LightSpot>,
    ) {
        for (light_index, (_entity, light_directional)) in light_directionals_query.iter().enumerate() {
            encoder.copy_buffer_to_buffer(
                &light_directional.wgpu_buffer,
                0,
                &self.wgpu_light_directional_uniforms_buffer,
                (light_index * 256) as wgpu::BufferAddress,
                256, // Note: ensure this matches the size of the struct in the shader
            );
        }

        for (light_index, (_entity, light_spot)) in lights_spots_query.iter().enumerate() {
            encoder.copy_buffer_to_buffer(
                &light_spot.wgpu_buffer,
                0,
                &self.wgpu_light_spot_uniforms_buffer,
                (light_index * 256) as wgpu::BufferAddress,
                256, // Note: ensure this matches the size of the struct in the shader
            );
        }
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        geometry_buffer: &GeometryBuffer,
        camera: &PerspectiveCamera,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        light_directional_shadow_texture_array_view: &TextureView,
        light_spots_query: &mut QueryBorrow<'_, &mut LightSpot>,
        light_spot_shadow_texture_array_view: &TextureView,
    ) -> Result<(), SurfaceError> {
        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            // Update buffers
            self.update_bind_group_buffers(&mut encoder, light_directionals_query, light_spots_query);
            self.update_bind_groups(
                surface_state,
                light_directional_shadow_texture_array_view,
                light_spot_shadow_texture_array_view,
            );

            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Lighting Pass Render Pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &self.output_color_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(Color::BLACK),
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                multiview_mask: None,
                timestamp_writes: None,
            });

            // Set settings for pass
            render_pass.set_pipeline(&self.render_pipeline);

            // Bind groups
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);
            render_pass.set_bind_group(1, &geometry_buffer.bind_group, &[]);

            // Camera
            render_pass.set_bind_group(2, &camera.bind_group, &[]);

            // Lighting
            if let Some(lighting_pass_bind_group) = &self.lighting_pass_bind_group {
                render_pass.set_bind_group(3, lighting_pass_bind_group, &[]);
            }

            render_pass.draw(0..3, 0..1); // Draw fullscreen tri
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
