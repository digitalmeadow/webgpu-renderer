use engine_data::DataContext;
use engine_ids::ResourceHandle;
use wgpu::{
    BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState, BufferBindingType, Color,
    ColorTargetState, ColorWrites, CommandEncoderDescriptor, CompareFunction, DepthStencilState, FragmentState, IndexFormat, LoadOp,
    MultisampleState, Operations, PipelineCompilationOptions, PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology,
    RenderPassColorAttachment, RenderPassDepthStencilAttachment, RenderPassDescriptor, RenderPipeline, RenderPipelineDescriptor, Sampler,
    SamplerBindingType, SamplerDescriptor, ShaderStages, StoreOp, SurfaceError, TextureFormat, TextureSampleType, TextureViewDimension,
    VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    errors::EngineGraphicsError,
    primitives::{camera::PerspectiveCamera, mesh::Mesh, vertex_mesh::VertexMesh},
    renderer::shared_buffers::{context_buffer::ContextBuffer, geometry_buffer::GeometryBuffer},
};

pub struct GeometryBufferPass {
    pub mesh_bind_group_layout: BindGroupLayout,
    pub geometry_pass_bind_group_layout: BindGroupLayout,
    geometry_pass_bind_group: Option<BindGroup>,
    render_pipeline: RenderPipeline,
    sampler_linear: Sampler,
}

impl GeometryBufferPass {
    pub fn new(surface_state: &SurfaceState, context_buffer: &ContextBuffer) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("geometry_pass.wgsl"));

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
                // Albedo Texture
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
                // Metalness Roughness Texture
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
                // Environment Map Texture (Cubemap)
                BindGroupLayoutEntry {
                    binding: 4,
                    visibility: ShaderStages::FRAGMENT,
                    ty: BindingType::Texture {
                        multisampled: false,
                        view_dimension: TextureViewDimension::Cube, // Cubemap
                        sample_type: TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // Gradient Map Texture
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
            ],
        });

        let geometry_pass_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Geometry Pass Bind Group Layout"),
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
                &geometry_pass_bind_group_layout,                             // 3
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("GeometryBuffer Pass Render Pipeline"),
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
                        format: TextureFormat::Rgba8UnormSrgb,
                        blend: Some(BlendState::REPLACE),
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

        let sampler_linear = surface_state.device.create_sampler(&SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });

        return {
            Self {
                mesh_bind_group_layout,
                geometry_pass_bind_group_layout,
                geometry_pass_bind_group: None,
                sampler_linear,
                render_pipeline,
            }
        };
    }

    pub fn create_bind_group_for_mesh(
        &self,
        surface_state: &SurfaceState,
        data_context: &DataContext,
        mesh: &mut Mesh,
    ) -> Result<(), EngineGraphicsError> {
        // Create wgpu resources for mesh's material

        // Albedo texture
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

        // Metalness and roughness texture
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

        // Environment texture
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

        // Gradient map
        let gradient_map_texture = mesh
            .material
            .gradient_map_texture // Can be None
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
            label: Some("Mesh Uniform Bind Group"),
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
                    resource: wgpu::BindingResource::TextureView(&albedo_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&metalness_roughness_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&environment_view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::TextureView(&gradient_map_view),
                },
            ],
        });

        mesh.bind_group_for_geometry_pass = Some(bind_group);
        Ok(())
    }

    pub fn update_bind_groups(&mut self, surface_state: &SurfaceState) {
        self.geometry_pass_bind_group = Some(surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Geometry Pass Bind Group"),
            layout: &self.geometry_pass_bind_group_layout,
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
        geometry_buffer: &GeometryBuffer,
        camera: &PerspectiveCamera,
        meshes: &Vec<&Mesh>,
    ) -> Result<(), SurfaceError> {
        self.update_bind_groups(surface_state);

        let mut encoder = surface_state
            .device
            .create_command_encoder(&CommandEncoderDescriptor { label: None });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("Geometry Buffer Render Pass"),
                color_attachments: &[
                    Some(RenderPassColorAttachment {
                        view: &geometry_buffer.albedo_metalness_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    }),
                    Some(RenderPassColorAttachment {
                        view: &geometry_buffer.normal_roughness_view,
                        resolve_target: None,
                        ops: Operations {
                            load: LoadOp::Clear(Color::BLACK),
                            store: StoreOp::Store,
                        },
                        depth_slice: None,
                    }),
                ],
                depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                    view: &geometry_buffer.depth_view,
                    depth_ops: Some(Operations {
                        load: LoadOp::Clear(1.0),
                        store: StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                multiview_mask: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            // Set settings for pass
            render_pass.set_pipeline(&self.render_pipeline);

            // Bind groups
            render_pass.set_bind_group(0, &context_buffer.bind_group, &[]);

            // Camera
            render_pass.set_bind_group(1, &camera.bind_group, &[]);

            // Pass
            if let Some(geometry_pass_bind_group) = &self.geometry_pass_bind_group {
                render_pass.set_bind_group(3, geometry_pass_bind_group, &[]);
            }

            // Iterate over meshes
            for mesh in meshes {
                // Index buffer
                render_pass.set_index_buffer(mesh.wgpu_index_buffer.slice(..), IndexFormat::Uint32);

                // Vertex buffer
                render_pass.set_vertex_buffer(0, mesh.wgpu_vertex_buffer.slice(..));

                // Uniforms (from Mesh bind gruop)
                assert!(mesh.bind_group_for_geometry_pass.is_some(), "Geometry Buffer missing from mesh");
                if let Some(bind_group) = &mesh.bind_group_for_geometry_pass {
                    render_pass.set_bind_group(2, bind_group, &[]);
                }

                render_pass.draw_indexed(0..mesh.wgpu_draw_range, 0, 0..1); // Draw indexed is used for TriangleStrips
            }
        }

        surface_state.queue.submit(std::iter::once(encoder.finish()));
        Ok(())
    }
}
