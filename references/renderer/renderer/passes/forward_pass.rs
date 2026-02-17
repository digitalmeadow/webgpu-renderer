use engine_data::DataContext;
use engine_ids::ResourceHandle;
use engine_world::QueryBorrow;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, Buffer, BufferBindingType,
    ColorTargetState, ColorWrites, CommandEncoder, CommandEncoderDescriptor, CompareFunction, DepthStencilState, Face, FragmentState,
    IndexFormat, LoadOp, MultisampleState, Operations, PipelineCompilationOptions, PipelineLayoutDescriptor, PrimitiveState,
    PrimitiveTopology, RenderPassColorAttachment, RenderPassDepthStencilAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, Sampler, SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp, SurfaceError, TextureSampleType,
    TextureView, TextureViewDimension, VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    errors::EngineGraphicsError,
    primitives::{
        camera::PerspectiveCamera, light_directional::LightDirectional, light_spot::LightSpot, mesh::Mesh, vertex_mesh::VertexMesh,
    },
    renderer::{
        passes::{shadow_pass_directional::MAX_LIGHT_DIRECTIONAL_COUNT, shadow_pass_spot::MAX_LIGHT_SPOT_COUNT},
        shared_buffers::{context_buffer::ContextBuffer, geometry_buffer::GeometryBuffer},
    },
};

pub struct ForwardPass {
    pub mesh_bind_group_layout: BindGroupLayout,
    pub lighting_bind_group_layout: BindGroupLayout,
    lighting_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    pub wgpu_light_directional_uniforms_buffer: Buffer,
    pub wgpu_light_spot_uniforms_buffer: Buffer,
    sampler_linear: Sampler,
    sampler_comparison: Sampler,
}

impl ForwardPass {
    pub fn new(surface_state: &SurfaceState, context_buffer: &ContextBuffer) -> Self {
        let shader = surface_state.device.create_shader_module(include_wgsl!("forward_pass.wgsl"));

        // Mesh bind group layout (same as geometry pass)
        let mesh_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Forward Pass Mesh Bind Group Layout"),
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
                // Sampler Linear
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
                // Metalness Roughness Texture
                BindGroupLayoutEntry {
                    binding: 4,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::D2,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Environment Map Texture (Cubemap)
                BindGroupLayoutEntry {
                    binding: 5,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::Cube,
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Gradient Map Texture
                BindGroupLayoutEntry {
                    binding: 6,
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

        // Lighting bind group layout (from lighting pass)
        let lighting_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Forward Pass Lighting Bind Group Layout"),
            entries: &[
                // Sampler Comparison (Shadows)
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Sampler(SamplerBindingType::Comparison),
                    count: None,
                },
                // LightDirectionals
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
                // LightDirectional Shadow Texture Array
                BindGroupLayoutEntry {
                    binding: 2,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        sample_type: TextureSampleType::Depth,
                        view_dimension: TextureViewDimension::D2Array,
                    },
                    count: None,
                },
                // LightSpots
                BindGroupLayoutEntry {
                    binding: 3,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Buffer {
                        ty: BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // LightSpot Shadow Texture Array
                BindGroupLayoutEntry {
                    binding: 4,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        sample_type: TextureSampleType::Depth,
                        view_dimension: TextureViewDimension::D2Array,
                    },
                    count: None,
                },
            ],
        });

        let wgpu_light_directional_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Forward Pass Light Directional Uniforms Buffer"),
            size: 256 * MAX_LIGHT_DIRECTIONAL_COUNT as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let wgpu_light_spot_uniforms_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Forward Pass Light Spot Uniforms Buffer"),
            size: 256 * MAX_LIGHT_SPOT_COUNT as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: Some("Forward Pass Pipeline Layout"),
            bind_group_layouts: &[
                &context_buffer.bind_group_layout,                            // 0
                &PerspectiveCamera::bind_group_layout(&surface_state.device), // 1
                &mesh_bind_group_layout,                                      // 2
                &lighting_bind_group_layout,                                  // 3
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Forward Pass Render Pipeline"),
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
                targets: &[Some(ColorTargetState {
                    format: surface_state.config.format,
                    // Alpha blending for transparency
                    // blend: Some(BlendState {
                    //     color: BlendComponent {
                    //         src_factor: BlendFactor::SrcAlpha,
                    //         dst_factor: BlendFactor::OneMinusSrcAlpha,
                    //         operation: BlendOperation::Add,
                    //     },
                    //     alpha: BlendComponent {
                    //         src_factor: BlendFactor::One,
                    //         dst_factor: BlendFactor::OneMinusSrcAlpha,
                    //         operation: BlendOperation::Add,
                    //     },
                    // }),
                    blend: Some(BlendState::ALPHA_BLENDING),
                    write_mask: ColorWrites::ALL,
                })],
                compilation_options: PipelineCompilationOptions::default(),
            }),
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                cull_mode: Some(Face::Back), // Backface culling is okay for bottles, windows etc
                ..Default::default()
            },
            depth_stencil: Some(DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,                // Don't write depth for transparent objects
                depth_compare: CompareFunction::LessEqual, // Test against opaque geometry
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
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });

        let sampler_comparison = surface_state.device.create_sampler(&SamplerDescriptor {
            label: Some("Forward Pass Sampler Comparison (Shadows)"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });

        Self {
            mesh_bind_group_layout,
            lighting_bind_group_layout,
            lighting_bind_group: None,
            render_pipeline,
            wgpu_light_directional_uniforms_buffer,
            wgpu_light_spot_uniforms_buffer,
            sampler_linear,
            sampler_comparison,
        }
    }

    pub fn create_bind_group_for_mesh(
        &self,
        surface_state: &SurfaceState,
        data_context: &DataContext,
        mesh: &mut Mesh,
    ) -> Result<(), EngineGraphicsError> {
        let albedo_texture = mesh
            .material
            .albedo_texture
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Albedo not found".to_string()))?;

        let albedo_texture_image_id = data_context
            .handles
            .get(&albedo_texture.image_handle)
            .ok_or(EngineGraphicsError::GltfError("Albedo image handle not found".to_string()))?;

        let albedo_texture_image = data_context
            .get_image(&albedo_texture_image_id)
            .map_err(|e| EngineGraphicsError::FileError("Albedo image not found".to_string(), e.to_string()))?;
        albedo_texture.create_view(surface_state, albedo_texture_image);

        let albedo_view = albedo_texture
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Albedo view not found".to_string()))?;

        let metalness_roughness_texture = mesh
            .material
            .metalness_roughness_texture
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Metalness Roughness not found".to_string()))?;

        let metalness_roughness_texture_image_id =
            data_context
                .handles
                .get(&metalness_roughness_texture.image_handle)
                .ok_or(EngineGraphicsError::GltfError(
                    "Metalness Roughness image handle not found".to_string(),
                ))?;

        let metalness_roughness_texture_image = data_context
            .get_image(&metalness_roughness_texture_image_id)
            .map_err(|e| EngineGraphicsError::FileError("Metalness Roughness image not found".to_string(), e.to_string()))?;

        metalness_roughness_texture.create_view(surface_state, metalness_roughness_texture_image);

        let metalness_roughness_view = metalness_roughness_texture
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Metalness Roughness view not found".to_string()))?;

        let environment_texture = mesh.material.environment_texture.as_mut().ok_or(EngineGraphicsError::FileError(
            "Environment not found".to_string(),
            "Environment texture".to_string(),
        ))?;

        let environment_texture_cube_map_images_high_res_resource_handle =
            ResourceHandle(environment_texture.folder_handle.0.clone() + "/" + "high_res");
        let environment_texture_cube_map_images_high_res_resource_id = data_context
            .handles
            .get(&environment_texture_cube_map_images_high_res_resource_handle)
            .ok_or(EngineGraphicsError::FileError(
                "Resource handle not found".to_string(),
                environment_texture_cube_map_images_high_res_resource_handle.0,
            ))?;
        let environment_texture_cube_map_images_high_res = data_context
            .get_cube_map_images(&environment_texture_cube_map_images_high_res_resource_id)
            .ok_or(EngineGraphicsError::FileError(
                "Environment image not found".to_string(),
                environment_texture_cube_map_images_high_res_resource_id.0.clone().to_string(),
            ))?;

        let environment_texture_cube_map_images_low_res_resource_handle =
            ResourceHandle(environment_texture.folder_handle.0.clone() + "/" + "low_res");
        let environment_texture_cube_map_images_low_res_resource_id = data_context
            .handles
            .get(&environment_texture_cube_map_images_low_res_resource_handle)
            .ok_or(EngineGraphicsError::FileError(
                "Resource handle not found".to_string(),
                environment_texture_cube_map_images_low_res_resource_handle.0,
            ))?;
        let environment_texture_cube_map_images_low_res = data_context
            .get_cube_map_images(&environment_texture_cube_map_images_low_res_resource_id)
            .ok_or(EngineGraphicsError::FileError(
                "Environment image not found".to_string(),
                environment_texture_cube_map_images_low_res_resource_id.0.clone().to_string(),
            ))?;

        environment_texture.create_view(
            surface_state,
            &environment_texture_cube_map_images_high_res,
            &environment_texture_cube_map_images_low_res,
        );

        let environment_view = environment_texture
            .view
            .as_mut()
            .ok_or(EngineGraphicsError::GltfError("Environment view not found".to_string()))?;

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
            label: Some("Forward Pass Mesh Bind Group"),
            layout: &self.mesh_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: mesh.wgpu_mesh_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: mesh.wgpu_material_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_linear),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&albedo_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&metalness_roughness_view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(&environment_view),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: wgpu::BindingResource::TextureView(&gradient_map_view),
                },
            ],
        });

        mesh.bind_group_for_forward_pass = Some(bind_group);
        Ok(())
    }

    pub fn update_bind_groups(
        &mut self,
        surface_state: &SurfaceState,
        light_directional_shadow_texture_array_view: &TextureView,
        light_spot_shadow_texture_array_view: &TextureView,
    ) {
        self.lighting_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Forward Pass Lighting Bind Group"),
            layout: &self.lighting_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.sampler_comparison),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.wgpu_light_directional_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&light_directional_shadow_texture_array_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.wgpu_light_spot_uniforms_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&light_spot_shadow_texture_array_view),
                },
            ],
        }));
    }

    pub fn update_light_buffers(
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
                256,
            );
        }

        for (light_index, (_entity, light_spot)) in lights_spots_query.iter().enumerate() {
            encoder.copy_buffer_to_buffer(
                &light_spot.wgpu_buffer,
                0,
                &self.wgpu_light_spot_uniforms_buffer,
                (light_index * 256) as wgpu::BufferAddress,
                256,
            );
        }
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        geometry_buffer: &GeometryBuffer,
        output_color_view: &TextureView,
        camera: &PerspectiveCamera,
        meshes: &Vec<&Mesh>,
        light_directionals_query: &mut QueryBorrow<'_, &mut LightDirectional>,
        light_directional_shadow_texture_array_view: &TextureView,
        light_spots_query: &mut QueryBorrow<'_, &mut LightSpot>,
        light_spot_shadow_texture_array_view: &TextureView,
    ) -> Result<(), SurfaceError> {
        let mut encoder = surface_state.device.create_command_encoder(&CommandEncoderDescriptor {
            label: Some("Forward Pass Encoder"),
        });

        {
            // Update light buffers
            self.update_light_buffers(&mut encoder, light_directionals_query, light_spots_query);
            self.update_bind_groups(
                surface_state,
                light_directional_shadow_texture_array_view,
                light_spot_shadow_texture_array_view,
            );

            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Forward Pass Render Pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: output_color_view, // Render on top of lighting pass output
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Load, // Load existing content (don't clear)
                        store: StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                    view: &geometry_buffer.depth_view, // Test against deferred depth
                    depth_ops: Some(Operations {
                        load: LoadOp::Load, // Load existing depth
                        store: StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                multiview_mask: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);

            // Bind groups
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);
            render_pass.set_bind_group(1, &camera.bind_group, &[]);

            if let Some(lighting_bind_group) = &self.lighting_bind_group {
                render_pass.set_bind_group(3, lighting_bind_group, &[]);
            }

            // Render transparent meshes
            // TODO: Sort meshes back-to-front by distance from camera for correct blending
            for mesh in meshes {
                render_pass.set_index_buffer(mesh.wgpu_index_buffer.slice(..), IndexFormat::Uint32);
                render_pass.set_vertex_buffer(0, mesh.wgpu_vertex_buffer.slice(..));

                if let Some(bind_group) = &mesh.bind_group_for_forward_pass {
                    render_pass.set_bind_group(2, bind_group, &[]);
                }

                render_pass.draw_indexed(0..mesh.wgpu_draw_range, 0, 0..1);
            }
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
