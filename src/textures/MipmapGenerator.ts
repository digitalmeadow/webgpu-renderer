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

// Per-texture caches for views and bind groups.
// WeakMap keys on GPUTexture so entries are evicted when the texture is GC'd.
type CubeMipCache = {
  srcViews: GPUTextureView[][];  // [mipIndex][faceIndex], mipIndex = mipLevel - 1
  dstViews: GPUTextureView[][];
  bindGroups: GPUBindGroup[][];
};
type Mip2DCache = {
  srcViews: GPUTextureView[];    // [mipIndex], mipIndex = mipLevel - 1
  dstViews: GPUTextureView[];
  bindGroups: GPUBindGroup[];
};
const _cubeMipCache = new WeakMap<GPUTexture, CubeMipCache>();
const _2dMipCache = new WeakMap<GPUTexture, Mip2DCache>();

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

  let cache = _2dMipCache.get(texture);
  if (!cache) {
    cache = { srcViews: [], dstViews: [], bindGroups: [] };
    for (let m = 1; m < mipLevelCount; m++) {
      const mi = m - 1;
      const srcView = texture.createView({ baseMipLevel: m - 1, mipLevelCount: 1 });
      const dstView = texture.createView({ baseMipLevel: m, mipLevelCount: 1 });
      cache.srcViews[mi] = srcView;
      cache.dstViews[mi] = dstView;
      cache.bindGroups[mi] = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: sampler },
        ],
      });
    }
    _2dMipCache.set(texture, cache);
  }

  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    const mi = mipLevel - 1;
    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: cache.dstViews[mi],
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, cache.bindGroups[mi]);
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

  let cache = _cubeMipCache.get(texture);
  if (!cache) {
    cache = { srcViews: [], dstViews: [], bindGroups: [] };
    for (let m = 1; m < mipLevelCount; m++) {
      const mi = m - 1;
      cache.srcViews[mi] = [];
      cache.dstViews[mi] = [];
      cache.bindGroups[mi] = [];
      for (let f = 0; f < 6; f++) {
        const srcView = texture.createView({
          dimension: "2d",
          baseMipLevel: m - 1,
          mipLevelCount: 1,
          baseArrayLayer: f,
          arrayLayerCount: 1,
        });
        const dstView = texture.createView({
          dimension: "2d",
          baseMipLevel: m,
          mipLevelCount: 1,
          baseArrayLayer: f,
          arrayLayerCount: 1,
        });
        cache.srcViews[mi][f] = srcView;
        cache.dstViews[mi][f] = dstView;
        cache.bindGroups[mi][f] = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: srcView },
            { binding: 1, resource: sampler },
          ],
        });
      }
    }
    _cubeMipCache.set(texture, cache);
  }

  for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const mi = mipLevel - 1;
      const passEncoder = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: cache.dstViews[mi][faceIndex],
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      });
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, cache.bindGroups[mi][faceIndex]);
      passEncoder.draw(6);
      passEncoder.end();
    }
  }
}

export function calculateMipLevelCount(size: number): number {
  return Math.floor(Math.log2(size)) + 1;
}
