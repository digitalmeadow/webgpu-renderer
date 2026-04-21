/**
 * GPU-based mipmap generation utilities for 2D and cubemap textures.
 * Uses render passes to downsample textures with linear filtering.
 */

const MIPMAP_SHADER_CODE = `
  @group(0) @binding(0) var inputTexture: texture_2d<f32>;
  @group(0) @binding(1) var inputSampler: sampler;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
  }

  @vertex
  fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(1.0, -1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(-1.0, -1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(-1.0, 1.0)
    );
    var uvs = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 0.0)
    );
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.uv = uvs[vertexIndex];
    return output;
  }

  @fragment
  fn fragmentMain(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(inputTexture, inputSampler, uv);
  }
`;

/**
 * Generate mipmaps for a 2D texture using GPU render passes.
 * Downsamples each mip level from the previous level using linear filtering.
 *
 * @param device - WebGPU device
 * @param texture - Target texture (must have RENDER_ATTACHMENT usage)
 * @param baseWidth - Width of mip level 0
 * @param baseHeight - Height of mip level 0
 * @param mipLevelCount - Total number of mip levels (including base)
 * @param format - Texture format
 */
export function generate2DMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  baseWidth: number,
  baseHeight: number,
  mipLevelCount: number,
  format: GPUTextureFormat,
): void {
  const shaderModule = device.createShaderModule({
    label: "Mipmap Generator Shader",
    code: MIPMAP_SHADER_CODE,
  });

  const sampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
  });

  const pipeline = device.createRenderPipeline({
    label: "2D Mipmap Generation Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "float" },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: "filtering" },
            },
          ],
        }),
      ],
    }),
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format: format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const encoder = device.createCommandEncoder({
    label: "2D Mipmap Generation Encoder",
  });

  let currentWidth = baseWidth;
  let currentHeight = baseHeight;

  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    currentWidth = Math.max(1, Math.floor(currentWidth / 2));
    currentHeight = Math.max(1, Math.floor(currentHeight / 2));

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: texture.createView({
            baseMipLevel: mipLevel - 1,
            mipLevelCount: 1,
          }),
        },
        { binding: 1, resource: sampler },
      ],
    });

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({
            baseMipLevel: mipLevel,
            mipLevelCount: 1,
          }),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(6);
    passEncoder.end();
  }

  device.queue.submit([encoder.finish()]);
}

/**
 * Generate mipmaps for a cubemap texture using GPU render passes.
 * Downsamples each face of each mip level from the previous level using linear filtering.
 *
 * @param device - WebGPU device
 * @param texture - Target cubemap texture (must have 6 array layers and RENDER_ATTACHMENT usage)
 * @param baseSize - Size of mip level 0 (assumed square)
 * @param mipLevelCount - Total number of mip levels (including base)
 * @param format - Texture format
 */
export function generateCubeMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  baseSize: number,
  mipLevelCount: number,
  format: GPUTextureFormat,
): void {
  const shaderModule = device.createShaderModule({
    label: "Cubemap Mipmap Generator Shader",
    code: MIPMAP_SHADER_CODE,
  });

  const sampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
  });

  const pipeline = device.createRenderPipeline({
    label: "Cubemap Mipmap Generation Pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "float" },
            },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: "filtering" },
            },
          ],
        }),
      ],
    }),
    vertex: {
      module: shaderModule,
      entryPoint: "vertexMain",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format: format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const encoder = device.createCommandEncoder({
    label: "Cubemap Mipmap Generation Encoder",
  });

  let currentSize = baseSize;

  // Generate mipmaps for each level (skip base level 0)
  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    currentSize = Math.max(1, Math.floor(currentSize / 2));

    // Generate mip for all 6 cubemap faces
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: texture.createView({
              dimension: "2d",
              baseMipLevel: mipLevel - 1,
              mipLevelCount: 1,
              baseArrayLayer: faceIndex,
              arrayLayerCount: 1,
            }),
          },
          { binding: 1, resource: sampler },
        ],
      });

      const passEncoder = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView({
              dimension: "2d",
              baseMipLevel: mipLevel,
              mipLevelCount: 1,
              baseArrayLayer: faceIndex,
              arrayLayerCount: 1,
            }),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });

      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6);
      passEncoder.end();
    }
  }

  device.queue.submit([encoder.finish()]);
}

/**
 * Calculate the optimal number of mip levels for a given texture size.
 * Returns the full mip chain down to 1x1.
 *
 * @param size - Texture size (width, height, or max dimension)
 * @returns Number of mip levels
 */
export function calculateMipLevelCount(size: number): number {
  return Math.floor(Math.log2(size)) + 1;
}
