use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, Color, ColorTargetState,
    ColorWrites, CommandEncoderDescriptor, FragmentState, LoadOp, MultisampleState, Operations, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp, SurfaceError, TextureSampleType,
    TextureView, TextureViewDescriptor, TextureViewDimension, VertexState, include_wgsl,
};

use crate::SurfaceState;

pub struct OutputPass {
    output_pass_bind_group_layout: BindGroupLayout,
    output_pass_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    sampler_linear: Sampler,
}

impl OutputPass {
    pub fn new(surface_state: &SurfaceState) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("output_pass.wgsl"));

        let output_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Output Pass Uniform Bind Group Layout"),
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
                // Input Text
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
            ],
        });

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&output_pass_bind_group_layout],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Output Pass Render Pipeline"),
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

        return {
            Self {
                output_pass_bind_group_layout,
                output_pass_bind_group: None,
                render_pipeline,
                sampler_linear,
            }
        };
    }

    pub fn update_bind_groups(&mut self, surface_state: &SurfaceState, input_color_view: &TextureView, input_text_view: &TextureView) {
        self.output_pass_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Output Pass Bind Group"),
            layout: &self.output_pass_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(input_color_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(input_text_view),
                },
            ],
        }));
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        input_color_view: &TextureView,
        input_text_view: &TextureView,
    ) -> Result<(), SurfaceError> {
        self.update_bind_groups(surface_state, &input_color_view, &input_text_view);

        let output_pass_texture = surface_state.surface.get_current_texture()?;
        let output_pass_view = output_pass_texture.texture.create_view(&TextureViewDescriptor::default());

        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Output Pass Render Pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &output_pass_view,
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

            if let Some(bind_group) = &self.output_pass_bind_group {
                render_pass.set_bind_group(0, bind_group, &[]);
            }

            render_pass.draw(0..3, 0..1); // Draw fullscreen tri
        }

        // Quad render pass
        surface_state.queue.submit(std::iter::once(encoder.finish()));
        output_pass_texture.present();

        Ok(())
    }
}
