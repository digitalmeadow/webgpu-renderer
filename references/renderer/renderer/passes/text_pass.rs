use engine_data::DataContext;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, BufferBindingType, Color,
    ColorTargetState, ColorWrites, CommandEncoderDescriptor, Extent3d, FragmentState, IndexFormat, LoadOp, MultisampleState, Operations,
    PipelineCompilationOptions, PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassColorAttachment,
    RenderPassDescriptor, RenderPipeline, RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp,
    SurfaceError, Texture, TextureDescriptor, TextureDimension, TextureSampleType, TextureUsages, TextureView, TextureViewDescriptor,
    TextureViewDimension, VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    errors::EngineGraphicsError,
    primitives::{mesh_text::MeshText, vertex_text::VertexText},
    renderer::shared_buffers::context_buffer::ContextBuffer,
};

pub struct TextPass {
    pub mesh_text_bind_group_layout: BindGroupLayout,
    pub text_pass_bind_group_layout: BindGroupLayout,
    text_pass_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    sampler_linear: Sampler,
    output_color: Texture,
    pub output_color_view: TextureView,
}

impl TextPass {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("text_pass.wgsl"));

        let mesh_text_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("MeshText Bind Group Layout"),
            entries: &[
                // MeshText uniforms
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Font atlas sampler
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Font atlas texture
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

        let text_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Text Pass Bind Group Layout"),
            entries: &[
                // Sampler Linear
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[
                &context_buffer.bind_group_layout, // 0
                &mesh_text_bind_group_layout,      // 1
                &text_pass_bind_group_layout,      // 2
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Text Pass Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[VertexText::buffer_layout()],
                compilation_options: PipelineCompilationOptions::default(),
            },
            fragment: Some(FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(ColorTargetState {
                    format: surface_state.config.format,
                    blend: Some(BlendState::ALPHA_BLENDING),
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
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });

        let output_color = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Text Pass Output Color Texture"),
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

        let output_color_view = output_color.create_view(&TextureViewDescriptor::default());

        return {
            Self {
                mesh_text_bind_group_layout,
                text_pass_bind_group_layout,
                text_pass_bind_group: None,
                render_pipeline,
                sampler_linear,
                output_color,
                output_color_view,
            }
        };
    }

    pub fn create_bind_group_for_mesh(
        &self,
        surface_state: &SurfaceState,
        data_context: &DataContext,
        mesh: &mut MeshText,
    ) -> Result<(), EngineGraphicsError> {
        // Create wgpu resources for mesh's material
        // Texture atlas
        let texture_atlas = &mut mesh.material.texture_atlas;

        let texture_atlas_image_id = data_context
            .handles
            .get(&texture_atlas.image_handle)
            .ok_or(EngineGraphicsError::GltfError(
                "Font Texture Atlas image handle not found".to_string(),
            ))?;

        let texture_atlas_image = data_context
            .get_image(&texture_atlas_image_id)
            .map_err(|_| EngineGraphicsError::GltfError("Font Texture Atlas image not found".to_string()))?;

        texture_atlas.create_view(surface_state, texture_atlas_image);

        let texture_atlas_view = texture_atlas
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Texture Atlas view not found".to_string()))?;

        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("MeshText Uniform Bind Group"),
            layout: &self.mesh_text_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: mesh.wgpu_mesh_text_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&texture_atlas_view),
                },
            ],
        });

        mesh.bind_group_for_text_pass = Some(bind_group);
        Ok(())
    }

    pub fn update_bind_groups(&mut self, surface_state: &SurfaceState) {
        self.text_pass_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Text Pass Bind Group"),
            layout: &self.text_pass_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
            }],
        }));
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        meshes_text: &Vec<&MeshText>,
    ) -> Result<&Texture, SurfaceError> {
        self.update_bind_groups(surface_state);

        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &self.output_color_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(Color::TRANSPARENT),
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

            if let Some(text_pass_bind_group) = &self.text_pass_bind_group {
                render_pass.set_bind_group(2, text_pass_bind_group, &[]);
            }

            // Iterate over meshes
            for mesh in meshes_text {
                // Index buffer
                render_pass.set_index_buffer(mesh.wgpu_index_buffer.slice(..), IndexFormat::Uint32);

                // Vertex buffer
                render_pass.set_vertex_buffer(0, mesh.wgpu_vertex_buffer.slice(..));

                // Uniforms (from Mesh bind gruop)
                if let Some(mesh_bind_group) = &mesh.bind_group_for_text_pass {
                    render_pass.set_bind_group(1, mesh_bind_group, &[]);
                }

                render_pass.draw_indexed(0..mesh.wgpu_draw_range, 0, 0..1); // Draw indexed is used for TriangleStrips
            }
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(&self.output_color)
    }
}
