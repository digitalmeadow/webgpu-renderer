use engine_world::QueryBorrow;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, Buffer, BufferBindingType, Color,
    ColorTargetState, ColorWrites, CommandEncoder, CommandEncoderDescriptor, CompareFunction, DepthStencilState, Extent3d, FragmentState,
    IndexFormat, LoadOp, MultisampleState, Operations, PipelineCompilationOptions, PipelineLayoutDescriptor, PrimitiveState,
    PrimitiveTopology, RenderPassColorAttachment, RenderPassDepthStencilAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, Sampler, SamplerBindingType, ShaderStages, StoreOp, SurfaceError, Texture, TextureDescriptor,
    TextureDimension, TextureFormat, TextureSampleType, TextureUsages, TextureView, TextureViewDescriptor, TextureViewDimension,
    VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    primitives::{camera::PerspectiveCamera, light_directional::LightDirectional, mesh::Mesh, vertex_mesh::VertexMesh},
    renderer::shared_buffers::context_buffer::ContextBuffer,
};

pub struct StandardPass {
    pub lighting_bind_group_layout: BindGroupLayout,
    pub wgpu_lighting_uniforms_buffer: Buffer,
    pub lighting_bind_group: Option<BindGroup>,
    pub mesh_bind_group_layout: BindGroupLayout,
    render_pipeline: RenderPipeline,
    pub color_texture: Texture,
    pub color_view: TextureView,
    pub depth_texture: Texture,
    pub depth_view: TextureView,
    pub position_texture: Texture,
    pub position_view: TextureView,
    pub normal_texture: Texture,
    pub normal_view: TextureView,
    pub shadow_texture_sampler: Sampler,
}

impl StandardPass {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("standard_pass.wgsl"));

        let lighting_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Lighting Uniforms Bind Group Layout"),
            entries: &[
                // Lights directional array: [View projection matrix; SHADOW_MAP_CASCADES_COUNT], position
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Shadow sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                    count: None,
                },
                // Shadows texture array
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        sample_type: wgpu::TextureSampleType::Depth,
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                    },
                    count: None,
                },
            ],
        });

        let wgpu_lighting_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Lighting Uniforms Buffer"),
            // Size of an array of LightsDirectional, with a size of MAX_LIGHTS
            size: 256 * 1,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mesh_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Mesh Bind Group Layout"),
            entries: &[
                // Mesh Uniforms
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::VERTEX,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Material Uniforms
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Albedo Sampler
                BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Albedo Texture
                BindGroupLayoutEntry {
                    binding: 3,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::D2,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Metalness Roughness Sampler
                BindGroupLayoutEntry {
                    binding: 4,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Metalness Roughness Texture
                BindGroupLayoutEntry {
                    binding: 5,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::D2,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Environment Map Sampler
                BindGroupLayoutEntry {
                    binding: 6,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Environment Map Texture (Cubemap)
                BindGroupLayoutEntry {
                    binding: 7,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::Cube, // Cubemap
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Gradient Map Sampler
                BindGroupLayoutEntry {
                    binding: 8,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Filtering),
                    count: None,
                },
                // Gradient Map Texture
                BindGroupLayoutEntry {
                    binding: 9,
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
            bind_group_layouts: &[
                &context_buffer.bind_group_layout,                            // 0
                &PerspectiveCamera::bind_group_layout(&surface_state.device), // 1
                &lighting_bind_group_layout,                                  // 2
                &mesh_bind_group_layout,                                      // 3
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Standard Pass Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[VertexMesh::buffer_layout()],
                compilation_options: PipelineCompilationOptions::default(),
            },
            fragment: Some(FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[
                    Some(ColorTargetState {
                        format: surface_state.config.format,
                        blend: Some(BlendState::ALPHA_BLENDING),
                        write_mask: ColorWrites::ALL,
                    }),
                    Some(ColorTargetState {
                        format: TextureFormat::Rgba32Float,
                        blend: None,
                        write_mask: ColorWrites::ALL,
                    }),
                    Some(ColorTargetState {
                        format: TextureFormat::Rgba16Float,
                        blend: None,
                        write_mask: ColorWrites::ALL,
                    }),
                ],
                compilation_options: PipelineCompilationOptions::default(),
            }),
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                cull_mode: Some(wgpu::Face::Back),

                ..Default::default()
            },
            depth_stencil: Some(DepthStencilState {
                format: TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: CompareFunction::LessEqual,
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview_mask: None,
            cache: None,
        });

        let color_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Standard Pass Render Texture"),
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

        let color_view = color_texture.create_view(&TextureViewDescriptor::default());

        let depth_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Standard Pass Depth Texture"),
            size: Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Depth32Float,
            usage: TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });

        let depth_view = depth_texture.create_view(&TextureViewDescriptor::default());

        let position_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Position Texture"),
            size: Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba32Float,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let position_view = position_texture.create_view(&TextureViewDescriptor::default());

        let normal_texture = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Normal Texture"),
            size: Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba16Float,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let normal_view = normal_texture.create_view(&TextureViewDescriptor::default());

        let shadow_texture_sampler = surface_state.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Shadow Texture Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });

        return {
            Self {
                lighting_bind_group_layout,
                wgpu_lighting_uniforms_buffer,
                lighting_bind_group: None,
                mesh_bind_group_layout,
                render_pipeline,
                color_texture,
                color_view,
                depth_texture,
                depth_view,
                position_texture,
                position_view,
                normal_texture,
                normal_view,
                shadow_texture_sampler,
            }
        };
    }

    // pub fn resize(&mut self, surface_state: &SurfaceState) {}

    pub fn update_bind_groups(&mut self, surface_state: &SurfaceState, shadow_texture_array_view: &TextureView) {
        // Lighting uniforms

        let lighting_bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Lighting Uniforms Bind Group"),
            layout: &self.lighting_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.wgpu_lighting_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.shadow_texture_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&shadow_texture_array_view),
                },
            ],
        });

        self.lighting_bind_group = Some(lighting_bind_group);
    }

    pub fn update_bind_group_buffers(
        &mut self,
        encoder: &mut CommandEncoder,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
    ) {
        for (index, (_entity, light_directional)) in light_directionals_query.iter().enumerate() {
            // Copy the existing light buffers into the lights array of this pass
            encoder.copy_buffer_to_buffer(
                &light_directional.wgpu_buffer,
                (index * 256) as wgpu::BufferAddress,
                &self.wgpu_lighting_uniforms_buffer,
                (index * 256) as wgpu::BufferAddress,
                256,
            );
        }
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        camera: &PerspectiveCamera,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        shadow_texture_array_view: &TextureView,
        meshes: &Vec<&Mesh>,
    ) -> Result<(), SurfaceError> {
        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            // Update buffers
            self.update_bind_group_buffers(&mut encoder, light_directionals_query);
            self.update_bind_groups(surface_state, shadow_texture_array_view);

            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[
                    Some(RenderPassColorAttachment {
                        view: &self.color_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    }),
                    Some(RenderPassColorAttachment {
                        view: &self.position_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    }),
                    Some(RenderPassColorAttachment {
                        view: &self.normal_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    }),
                ],
                depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(Operations {
                        load: LoadOp::Clear(1.0),
                        store: StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            // Set settings for pass
            render_pass.set_pipeline(&self.render_pipeline);

            // Bind groups
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);

            // Camera
            render_pass.set_bind_group(1, &camera.bind_group, &[]);

            // Lighting
            if let Some(lighting_bind_group) = &self.lighting_bind_group {
                render_pass.set_bind_group(2, lighting_bind_group, &[]);
            }

            // Iterate over meshes
            for mesh in meshes {
                // Index buffer
                render_pass.set_index_buffer(mesh.wgpu_index_buffer.slice(..), IndexFormat::Uint32);

                // Vertex buffer
                render_pass.set_vertex_buffer(0, mesh.wgpu_vertex_buffer.slice(..));

                // Uniforms (from Mesh bind gruop)
                if let Some(bind_group) = &mesh.bind_group_for_standard_pass {
                    render_pass.set_bind_group(3, bind_group, &[]);
                }

                render_pass.draw_indexed(0..mesh.wgpu_draw_range, 0, 0..1); // Draw indexed is used for TriangleStrips
            }
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
