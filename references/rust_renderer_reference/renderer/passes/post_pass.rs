use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, Color, ColorTargetState,
    ColorWrites, CommandEncoderDescriptor, Extent3d, FragmentState, LoadOp, MultisampleState, Operations, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp, SurfaceError, Texture,
    TextureDescriptor, TextureDimension, TextureSampleType, TextureUsages, TextureView, TextureViewDescriptor, TextureViewDimension,
    VertexState, include_wgsl,
};

use crate::{SurfaceState, primitives::camera::PerspectiveCamera, renderer::shared_buffers::context_buffer::ContextBuffer};

pub struct PostPass {
    render_pipeline: RenderPipeline,
    post_pass_bind_group_layout: BindGroupLayout,
    post_pass_bind_group: Option<BindGroup>,
    pub sampler_linear: Sampler,
    output_color_texture: Texture,
    pub output_color_view: TextureView,
}

impl PostPass {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("post_pass.wgsl"));

        let post_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Post Pass Uniform Bind Group Layout"),
            entries: &[
                // Sampler Linear
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Input Color
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::D2,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Geometry Buffer Normal+Roughness
                BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::D2,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Geometry Buffer Depth
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

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[
                &context_buffer.bind_group_layout,
                &PerspectiveCamera::bind_group_layout(&surface_state.device),
                &post_pass_bind_group_layout,
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Post Pass Render Pipeline"),
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
                    blend: Some(BlendState::REPLACE),
                    write_mask: ColorWrites::ALL,
                })],
                compilation_options: PipelineCompilationOptions::default(),
            }),
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                cull_mode: None,

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
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            ..Default::default()
        });

        let output_color_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Post Pass Output Color Texture"),
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
                render_pipeline,
                post_pass_bind_group_layout,
                post_pass_bind_group: None,
                sampler_linear,
                output_color_texture,
                output_color_view,
            }
        };
    }

    pub fn update_bind_groups(
        &mut self,
        surface_state: &SurfaceState,
        input_output_color_view: &TextureView,
        geometry_buffer_normal_roughness_view: &TextureView,
        geometry_buffer_depth_view: &TextureView,
    ) {
        self.post_pass_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Post Pass Bind Group"),
            layout: &self.post_pass_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(input_output_color_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(geometry_buffer_normal_roughness_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(geometry_buffer_depth_view),
                },
            ],
        }));
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        camera: &PerspectiveCamera,
        input_output_color_view: &TextureView,
        geometry_buffer_normal_roughness_view: &TextureView,
        geometry_buffer_depth_view: &TextureView,
    ) -> Result<(), SurfaceError> {
        self.update_bind_groups(
            surface_state,
            &input_output_color_view,
            &geometry_buffer_normal_roughness_view,
            &geometry_buffer_depth_view,
        );

        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Post Pass Render Pass"),
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

            // Uniforms
            // Context
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);

            // Camera
            render_pass.set_bind_group(1, &camera.bind_group, &[]);

            if let Some(bind_group) = &self.post_pass_bind_group {
                render_pass.set_bind_group(2, bind_group, &[]);
            }

            render_pass.draw(0..3, 0..1); // Draw the fullscreen tri
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
