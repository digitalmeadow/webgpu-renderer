export interface ShaderHooks {
  // Inject WGSL helper functions/declarations before the main hook functions
  uniforms?: string;
  // Replace fn get_albedo_color(uv: vec2<f32>) -> vec4<f32>
  albedo?: string;
  // Replace fn modify_albedo(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32>
  albedo_logic?: string;
  // Replace fn vertex_post_process(world_pos: vec3<f32>, uv: vec2<f32>, instance: InstanceInput) -> vec3<f32>
  vertex_post_process?: string;
}
