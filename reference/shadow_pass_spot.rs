use std::collections::HashMap;

use engine_world::{Entity, QueryBorrow, Without};
use wgpu::{
    BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BufferBindingType, CommandEncoderDescriptor,
    CompareFunction, DepthStencilState, Extent3d, IndexFormat, LoadOp, MultisampleState, Operations, PipelineCompilationOptions,
    PipelineLayoutDescriptor, PrimitiveState, PrimitiveTopology, RenderPassDepthStencilAttachment, RenderPassDescriptor, RenderPipeline,
    RenderPipelineDescriptor, ShaderStages, StoreOp, SurfaceError, TextureDescriptor, TextureDimension, TextureFormat, TextureUsages,
    TextureView, VertexState, include_wgsl,
};

use crate::{
    SurfaceState,
    errors::EngineGraphicsError,
    flags::forward_rendered::ForwardRendered,
    primitives::{aabb::AABB, light_spot::LightSpot, mesh::Mesh, shadows::ShadowCasting, vertex_mesh::VertexMesh},
    renderer::shared_buffers::context_buffer::ContextBuffer,
};

pub const MAX_LIGHT_SPOT_COUNT: usize = 8;

pub struct ShadowPassSpot {
    pub mesh_bind_group_layout: BindGroupLayout,
    pub lighting_uniforms_bind_group_layout: BindGroupLayout,
    render_pipeline: RenderPipeline,
    shadow_texture_array_views: Vec<TextureView>,
    pub shadow_texture_array_view: TextureView,
}

impl ShadowPassSpot {
    pub fn new(
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        render_width: Option<u32>,
        render_height: Option<u32>,
    ) -> Self {
        // Inputs
        let shader = surface_state.device.create_shader_module(include_wgsl!("shadow_pass_spot.wgsl"));

        let lighting_uniforms_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Light Spot Uniforms Bind Group Layout"),
            entries: &[
                // view_projection_matrix, color
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
            ],
        });

        let mesh_bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Mesh Uniforms Bind Group Layout"),
            entries: &[
                // Vertex Uniforms
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
            ],
        });

        let render_pipeline_layout = surface_state.device.create_pipeline_layout(&PipelineLayoutDescriptor {
            label: Some("Shadow Pass Spot Render Pipeline Layout"),
            bind_group_layouts: &[
                &context_buffer.bind_group_layout,    // 0
                &lighting_uniforms_bind_group_layout, // 1
                &mesh_bind_group_layout,              // 2
            ],
            immediate_size: 0,
        });

        let render_pipeline = surface_state.device.create_render_pipeline(&RenderPipelineDescriptor {
            label: Some("Shadow Pass Spot Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[VertexMesh::buffer_layout()],
                compilation_options: PipelineCompilationOptions::default(),
            },
            fragment: None,
            primitive: PrimitiveState {
                topology: PrimitiveTopology::TriangleList,
                strip_index_format: None,
                cull_mode: Some(wgpu::Face::Front),
                ..Default::default()
            },
            depth_stencil: Some(DepthStencilState {
                format: TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: CompareFunction::LessEqual,
                stencil: Default::default(),
                // bias: wgpu::DepthBiasState::default(),
                bias: wgpu::DepthBiasState {
                    constant: 4, // corresponds to bilinear filtering
                    slope_scale: 2.0,
                    clamp: 0.0,
                },
            }),
            multisample: MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let shadow_texture_array = surface_state.device.create_texture(&TextureDescriptor {
            label: Some("Shadow Pass Spot Render Texture"),
            size: Extent3d {
                width: render_width.unwrap_or(surface_state.config.width),
                height: render_height.unwrap_or(surface_state.config.height),
                depth_or_array_layers: MAX_LIGHT_SPOT_COUNT as u32,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Depth32Float,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });

        let shadow_texture_array_views = (0..MAX_LIGHT_SPOT_COUNT)
            .map(|i| {
                shadow_texture_array.create_view(&wgpu::TextureViewDescriptor {
                    label: Some("Shadow Spot Texture View"),
                    format: None,
                    dimension: Some(wgpu::TextureViewDimension::D2),
                    usage: None,
                    aspect: wgpu::TextureAspect::All,
                    base_mip_level: 0,
                    mip_level_count: None,
                    base_array_layer: i as u32, // Each view points to ONE layer
                    array_layer_count: Some(1),
                })
            })
            .collect::<Vec<_>>();

        let shadow_texture_array_view = shadow_texture_array.create_view(&wgpu::TextureViewDescriptor {
            label: Some("Shadow Spot Texture Array View"),
            format: None,
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            aspect: wgpu::TextureAspect::All,
            base_mip_level: 0,
            mip_level_count: None,
            base_array_layer: 0,
            array_layer_count: None,
            usage: None,
        });

        return {
            Self {
                lighting_uniforms_bind_group_layout,
                mesh_bind_group_layout,
                render_pipeline,
                shadow_texture_array_views,
                shadow_texture_array_view,
            }
        };
    }

    pub fn create_bind_group_for_mesh(&self, surface_state: &SurfaceState, mesh: &mut Mesh) -> Result<(), EngineGraphicsError> {
        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Mesh Uniform Bind Group"),
            layout: &self.mesh_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: mesh.wgpu_mesh_uniforms_buffer.as_entire_binding(),
            }],
        });

        mesh.bind_group_for_shadow_pass_spot = Some(bind_group);
        Ok(())
    }

    pub fn render(
        &mut self,
        surface_state: &SurfaceState,
        context_buffer: &ContextBuffer,
        lights_spot_query: &mut QueryBorrow<'_, &mut LightSpot>,
        meshes_shadow_casting_query: &mut QueryBorrow<'_, Without<(&Mesh, &AABB, &ShadowCasting), &ForwardRendered>>,
        meshes_shadow_casting_rendered_entities_per_light_spot: &HashMap<Entity, Vec<Entity>>,
    ) -> Result<(), SurfaceError> {
        let meshes_shadow_casting_view = meshes_shadow_casting_query.view();

        {
            for (light_index, (light_spot_entity, light_spot)) in lights_spot_query.iter().enumerate() {
                // Meshes entities for this light
                let meshes_rendered_entities_per_light_spot = meshes_shadow_casting_rendered_entities_per_light_spot
                    .get(&light_spot_entity)
                    .expect("LightSpot not found");

                let mut encoder = surface_state
                    .device
                    .create_command_encoder(&CommandEncoderDescriptor { label: None });

                {
                    let mut shadow_pass_spot = encoder.begin_render_pass(&RenderPassDescriptor {
                        label: Some("Shadow Pass Spot Render Pass"),
                        color_attachments: &[],
                        depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                            view: &self.shadow_texture_array_views[light_index],
                            depth_ops: Some(Operations {
                                load: LoadOp::Clear(1.0),
                                store: StoreOp::Store,
                            }),
                            stencil_ops: None,
                        }),
                        occlusion_query_set: None,
                        multiview_mask: None,
                        timestamp_writes: None,
                    });

                    // Set settings for pass
                    shadow_pass_spot.set_pipeline(&self.render_pipeline);

                    // Bind groups
                    shadow_pass_spot.set_bind_group(0, &context_buffer.bind_group, &[]);

                    // Light (defines our 'camera' for this pass)
                    shadow_pass_spot.set_bind_group(1, &light_spot.bind_group, &[]);

                    // for mesh in meshes {
                    for meshes_rendered_entity in meshes_rendered_entities_per_light_spot {
                        let (mesh, _aabb, _shadow_casting) = meshes_shadow_casting_view
                            .get(*meshes_rendered_entity)
                            .expect("Mesh component not found in meshes per light spot cascade level");

                        // Index buffer
                        shadow_pass_spot.set_index_buffer(mesh.wgpu_index_buffer.slice(..), IndexFormat::Uint32);

                        // Vertex buffer
                        shadow_pass_spot.set_vertex_buffer(0, mesh.wgpu_vertex_buffer.slice(..));

                        // Uniforms (from Mesh bind gruop)
                        if let Some(bind_group) = &mesh.bind_group_for_shadow_pass_spot {
                            shadow_pass_spot.set_bind_group(2, bind_group, &[]);
                        }

                        shadow_pass_spot.draw_indexed(0..mesh.wgpu_draw_range, 0, 0..1); // Draw indexed is used for TriangleStrips
                    }
                }

                surface_state.queue.submit(std::iter::once(encoder.finish()));
            }
        }

        Ok(())
    }
}
