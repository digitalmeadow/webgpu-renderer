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

// Cached per format — pipeline creation is expensive and format is the only variant.
// Caveat: cache persists across device resets; invalidate if device loss recovery is added.
const _pipelineCache = new Map<GPUTextureFormat, GPURenderPipeline>();
let _sampler: GPUSampler | null = null;

function getMipmapSampler(device: GPUDevice): GPUSampler {
  if (!_sampler) {
    _sampler = device.createSampler({
      label: "Mipmap Blit Sampler",
      minFilter: "linear",
      magFilter: "linear",
    });
  }
  return _sampler;
}

function getMipmapPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const cached = _pipelineCache.get(format);
  if (cached) return cached;

  const shaderModule = device.createShaderModule({
    label: "Mipmap Generator Shader",
    code: MIPMAP_SHADER_CODE,
  });

  const pipeline = device.createRenderPipeline({
    label: `Mipmap Generation Pipeline (${format})`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        device.createBindGroupLayout({
          label: `Mipmap Bind Group Layout (${format})`,
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
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  _pipelineCache.set(format, pipeline);
  return pipeline;
}

export function generate2DMipmaps(
  encoder: GPUCommandEncoder,
  device: GPUDevice,
  texture: GPUTexture,
  baseWidth: number,
  baseHeight: number,
  mipLevelCount: number,
  format: GPUTextureFormat,
): void {
  const pipeline = getMipmapPipeline(device, format);
  const sampler = getMipmapSampler(device);

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
}

export function generateCubeMipmaps(
  encoder: GPUCommandEncoder,
  device: GPUDevice,
  texture: GPUTexture,
  baseSize: number,
  mipLevelCount: number,
  format: GPUTextureFormat,
): void {
  const pipeline = getMipmapPipeline(device, format);
  const sampler = getMipmapSampler(device);

  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
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
}

export function calculateMipLevelCount(size: number): number {
  return Math.floor(Math.log2(size)) + 1;
}
