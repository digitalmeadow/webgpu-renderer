use engine_data::DataContext;
use engine_world::QueryBorrow;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, ColorTargetState, ColorWrites,
    CommandEncoderDescriptor, Extent3d, FragmentState, IndexFormat, LoadOp, MultisampleState, Operations, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassColorAttachment, RenderPassDepthStencilAttachment,
    RenderPassDescriptor, RenderPipeline, RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp,
    SurfaceError, Texture, TextureDescriptor, TextureDimension, TextureSampleType, TextureUsages, TextureView, TextureViewDescriptor,
    TextureViewDimension, VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    errors::EngineGraphicsError,
    primitives::{
        camera::PerspectiveCamera, mesh_particle::MeshParticle, particle_emitter::ParticleEmitter,
        particle_instance::ParticleInstanceBuffer, vertex_particle::VertexParticle,
    },
    renderer::shared_buffers::context_buffer::ContextBuffer,
};

#[derive(Debug)]
pub struct ParticlesPass {
    pub mesh_bind_group_layout: BindGroupLayout,
    pub particles_pass_bind_group_layout: BindGroupLayout,
    particles_pass_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    pub sampler_linear: Sampler,
    output_color_texture: Texture,
    pub output_color_view: TextureView,
}

impl ParticlesPass {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("particles_pass.wgsl"));

        let mesh_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("MeshParticle Bind Group Layout"),
            entries: &[
                // MeshParticle uniforms
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Material uniforms
                BindGroupLayoutEntry {
                    binding: 1,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Atlas texture
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
                // Gradient Map Texture
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
            ],
        });

        let particles_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Particles Pass Bind Group Layout"),
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
                &context_buffer.bind_group_layout,                            // 0
                &PerspectiveCamera::bind_group_layout(&surface_state.device), // 1
                &mesh_bind_group_layout,                                      // 2
                &particles_pass_bind_group_layout,                            // 3
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Particles Pass Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    VertexParticle::buffer_layout(),
                    wgpu::VertexBufferLayout {
                        array_stride: std::mem::size_of::<ParticleInstanceBuffer>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &wgpu::vertex_attr_array![
                            3 => Float32x3,     // position
                            4 => Float32,       // scale
                            5 => Float32x4,     // rotation
                            6 => Uint32,        // atlas region index
                            7 => Uint32,        // gradient map index
                            8 => Float32,       // alpha
                            9 => Uint32,        // billboard
                            10 => Float32,      // frame_lerp
                        ],
                    },
                ],
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
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::LessEqual,
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
            label: Some("Particles Pass Output Color Texture"),
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
                mesh_bind_group_layout,
                particles_pass_bind_group_layout,
                particles_pass_bind_group: None,
                render_pipeline,
                sampler_linear,
                output_color_texture,
                output_color_view,
            }
        };
    }

    pub fn create_bind_group_for_mesh(
        &self,
        surface_state: &SurfaceState,
        data_context: &DataContext,
        mesh: &mut MeshParticle,
    ) -> Result<(), EngineGraphicsError> {
        // Texture atlas
        let texture_atlas = &mut mesh.material.texture_atlas;

        // Create wgpu resources for mesh's material
        let texture_atlas_regions_id = data_context
            .handles
            .get(&texture_atlas.atlas_regions_handle)
            .ok_or(EngineGraphicsError::GltfError("Texture Atlas regions handle not found".to_string()))?;

        let texture_atlas_regions = data_context
            .get_atlas_regions(&texture_atlas_regions_id)
            .map_err(|_| EngineGraphicsError::GltfError("Texture Atlas regions not found".to_string()))?;

        surface_state.queue.write_buffer(
            &mesh.wgpu_mesh_particle_uniforms_buffer,
            0,
            bytemuck::cast_slice(
                &[
                    texture_atlas_regions.regions_x,
                    texture_atlas_regions.regions_y,
                    texture_atlas_regions.regions_total,
                ]
                .as_slice(),
            ),
        );

        let texture_atlas_image_id = data_context
            .handles
            .get(&texture_atlas.image_handle)
            .ok_or(EngineGraphicsError::GltfError("Texture Atlas image handle not found".to_string()))?;

        let texture_atlas_image = data_context
            .get_image(&texture_atlas_image_id)
            .map_err(|_| EngineGraphicsError::GltfError("Texture Atlas image not found".to_string()))?;

        texture_atlas.create_view(surface_state, texture_atlas_image);

        let texture_atlas_view = texture_atlas
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Texture Atlas view not found".to_string()))?;

        // Gradient map
        let gradient_map_texture = mesh
            .material
            .gradient_map_texture
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Gradient map image not found".to_string()))?;

        let gradient_map_texture_image_id = data_context
            .handles
            .get(&gradient_map_texture.image_handle)
            .ok_or(EngineGraphicsError::GltfError("Gradient map image handle not found".to_string()))?;

        let gradient_map_texture_image = data_context
            .get_image(&gradient_map_texture_image_id)
            .map_err(|e| EngineGraphicsError::FileError("Gradient map image not found".to_string(), e.to_string()))?;
        gradient_map_texture.create_view(surface_state, gradient_map_texture_image);

        let gradient_map_view = gradient_map_texture
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Gradient map view not found".to_string()))?;

        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("MeshParticle Uniform Bind Group"),
            layout: &self.mesh_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: mesh.wgpu_mesh_particle_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: mesh.wgpu_material_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&texture_atlas_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&gradient_map_view),
                },
            ],
        });

        mesh.bind_group_for_particles_pass = Some(bind_group);
        Ok(())
    }

    pub fn update_bind_groups(&mut self, surface_state: &SurfaceState) {
        self.particles_pass_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Particles Pass Bind Group"),
            layout: &self.particles_pass_bind_group_layout,
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
        camera: &PerspectiveCamera,
        particles_emitters_query: &mut QueryBorrow<'_, &ParticleEmitter>,
        input_output_color_view: &TextureView,
        depth_view: &TextureView,
    ) -> Result<(), SurfaceError> {
        self.update_bind_groups(surface_state);

        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &input_output_color_view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Load, // Load previous scene
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                    view: &depth_view,
                    depth_ops: Some(Operations {
                        load: LoadOp::Load,
                        store: StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                multiview_mask: None,
                timestamp_writes: None,
            });

            // Set settings for pass
            render_pass.set_pipeline(&self.render_pipeline);

            // Bind groups
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);

            // Camera
            render_pass.set_bind_group(1, &camera.bind_group, &[]);

            // Pass
            if let Some(particles_pass_bind_group) = &self.particles_pass_bind_group {
                render_pass.set_bind_group(3, particles_pass_bind_group, &[]);
            }

            // Iterate over meshes
            for (_, particle_emitter) in particles_emitters_query.iter() {
                // Index buffer
                render_pass.set_index_buffer(
                    particle_emitter.system.mesh_particle.wgpu_index_buffer.slice(..),
                    IndexFormat::Uint32,
                );

                // Vertex buffer
                render_pass.set_vertex_buffer(0, particle_emitter.system.mesh_particle.wgpu_vertex_buffer.slice(..));

                // Instances
                render_pass.set_vertex_buffer(1, particle_emitter.system.wgpu_instances_buffer.slice(..));

                // Uniforms (from Mesh bind group)
                if let Some(bind_group) = &particle_emitter.system.mesh_particle.bind_group_for_particles_pass {
                    render_pass.set_bind_group(2, bind_group, &[]);
                }

                render_pass.draw_indexed(
                    0..particle_emitter.system.mesh_particle.wgpu_draw_range,
                    0,
                    0..particle_emitter.system.instances.len() as u32,
                );
            }
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
