use engine_timing::time::TimeContext;
use wgpu::{BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, Buffer, ShaderStages};

use crate::SurfaceState;

#[derive(Debug)]
pub struct ContextBuffer {
    pub bind_group_layout: BindGroupLayout,
    pub bind_group: BindGroup,
    pub wgpu_buffer: Buffer,
}

impl ContextBuffer {
    pub fn new(surface_state: &SurfaceState, render_width: Option<u32>, render_height: Option<u32>) -> Self {
        // Global context uniforms
        let bind_group_layout = surface_state.device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: Some("Context Uniform Bind Group Layout"),
            entries: &[
                // Context: duration, dt, screen_size, render_size
                BindGroupLayoutEntry {
                    binding: 0,
                    visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let wgpu_buffer = surface_state.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Context Uniforms Buffer"),
            // time_duration, time_delta, screen_size, render_size
            size: (4) + (4) + (4 + 4) + (4 + 4) as wgpu::BufferAddress,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Initilialize buffer with defaults
        let time_duration = 0.0;
        let time_delta = 0.0;
        let screen_size = [surface_state.config.width as f32, surface_state.config.height as f32];
        let render_size = [
            render_width.unwrap_or(surface_state.config.width) as f32,
            render_height.unwrap_or(surface_state.config.height) as f32,
        ];
        let wgpu_buffer_initial = [
            time_duration,
            time_delta,
            screen_size[0],
            screen_size[1],
            render_size[0],
            render_size[1],
        ];

        let bind_group = surface_state.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Standard Pass Context Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu_buffer.as_entire_binding(),
            }],
        });

        surface_state
            .queue
            .write_buffer(&wgpu_buffer, 0, bytemuck::cast_slice(&[wgpu_buffer_initial]));

        Self {
            bind_group_layout,
            bind_group,
            wgpu_buffer,
        }
    }

    pub fn update(&mut self, surface_state: &SurfaceState, time: &TimeContext) {
        surface_state.queue.write_buffer(
            &self.wgpu_buffer,
            0,
            bytemuck::cast_slice(&[time.duration.as_secs_f32(), time.delta]),
        );
    }
}
