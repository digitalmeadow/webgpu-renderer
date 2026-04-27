import {
  Camera,
  CubeTexture,
  DirectionalLight,
  FlyControls,
  MaterialBasic,
  MaterialCustom,
  MaterialParticle,
  MaterialPBR,
  Mesh,
  ParticleEmitter,
  Quat,
  ReflectionProbe,
  Renderer,
  Scene,
  SpotLight,
  Texture,
  Time,
  Vec3,
  World,
  createPlaneGeometry,
  createSphereGeometry,
  mapRange,
  RendererOptions,
} from "../src";

const UV_DEBUG_ALBEDO_HOOK = `fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
  return vec4<f32>(uv.x, uv.y, 0.0, 1.0);
}`;

const UV_DEBUG_FUNCTIONS_HOOK = `fn material_albedo_color() -> vec4<f32> {
  return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}`;

// Hook showcase sphere — exercises all four ShaderHooks

const HOOK_SHOWCASE_FUNCTIONS = `fn stripe(v: f32, freq: f32) -> f32 {
  return sin(v * freq * 6.28318) * 0.5 + 0.5;
}`;

const HOOK_SHOWCASE_ALBEDO = `fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
  let s = stripe(uv.x, 4.0) * stripe(uv.y, 6.0);
  return vec4<f32>(s * 0.9 + 0.1, 0.3, 0.8 - s * 0.5, 1.0);
}`;

const HOOK_SHOWCASE_ALBEDO_LOGIC = `fn modify_albedo(color: vec4<f32>, uv: vec2<f32>) -> vec4<f32> {
  let dist = length(uv - vec2<f32>(0.5, 0.5)) * 2.0;
  let rim = pow(dist, 2.0) * 0.4;
  return vec4<f32>(color.rgb + rim, color.a);
}`;

const HOOK_SHOWCASE_VERTEX = `fn vertex_post_process(world_pos: vec3<f32>, uv: vec2<f32>, instance: InstanceInput) -> vec3<f32> {
  let origin = vec3<f32>(instance.model_matrix_3.x, instance.model_matrix_3.y, instance.model_matrix_3.z);
  let local_normal = normalize(world_pos - origin);
  let displacement = sin(world_pos.y * 8.0 + world_pos.x * 4.0) * 0.10;
  return world_pos + local_normal * displacement;
}`;

// CustomMaterial sphere — time-driven vertex displacement + hue cycling via a raw geometry-pass shader
const CUSTOM_MATERIAL_SHADER = `
struct TimeUniforms {
    elapsed: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

struct CameraUniforms {
    view_matrix: mat4x4<f32>,
    projection_matrix: mat4x4<f32>,
    view_projection_matrix: mat4x4<f32>,
    view_matrix_inverse: mat4x4<f32>,
    projection_matrix_inverse: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

struct InstanceInput {
    @location(6) model_matrix_0: vec4<f32>,
    @location(7) model_matrix_1: vec4<f32>,
    @location(8) model_matrix_2: vec4<f32>,
    @location(9) model_matrix_3: vec4<f32>,
    @location(10) billboard_axis: u32,
    @location(11) custom_data_0: vec4<f32>,
    @location(12) custom_data_1: vec4<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv_coords: vec2<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) world_position: vec3<f32>,
    @location(3) world_tangent: vec4<f32>,
}

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) metal_rough: vec4<f32>,
    @location(3) emissive: vec4<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> time_uniforms: TimeUniforms;

@vertex
fn vs_main(
    @location(0) position: vec4<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
    @location(5) tangent: vec4<f32>,
    instance: InstanceInput,
) -> VertexOutput {
    var out: VertexOutput;

    let model_matrix = mat4x4<f32>(
        instance.model_matrix_0,
        instance.model_matrix_1,
        instance.model_matrix_2,
        instance.model_matrix_3,
    );

    let t = time_uniforms.elapsed;
    let local_pos = position.xyz;

    // Multi-frequency displacement along local normal — morphing blob effect
    let d = sin(t * 1.1 + local_pos.y * 6.0) * 0.12
          + sin(t * 0.7 + local_pos.x * 5.0 + local_pos.z * 3.0) * 0.08
          + sin(t * 1.7 + local_pos.z * 8.0) * 0.05;

    let displaced = local_pos + normalize(normal) * d;

    let world_pos = (model_matrix * vec4<f32>(displaced, 1.0)).xyz;
    out.world_position = world_pos;
    out.world_normal = normalize((model_matrix * vec4<f32>(normal, 0.0)).xyz);
    out.world_tangent = vec4<f32>((model_matrix * vec4<f32>(tangent.xyz, 0.0)).xyz, tangent.w);
    out.uv_coords = uv;

    let view_pos = camera.view_matrix * vec4<f32>(world_pos, 1.0);
    out.position = camera.projection_matrix * view_pos;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> GBufferOutput {
    var out: GBufferOutput;

    let t = time_uniforms.elapsed;

    // Hue cycling: R/G/B channels offset by 2π/3
    let r = sin(t * 0.5) * 0.5 + 0.5;
    let g = sin(t * 0.5 + 2.094) * 0.5 + 0.5;
    let b = sin(t * 0.5 + 4.189) * 0.5 + 0.5;

    out.albedo = vec4<f32>(r, g, b, 1.0);
    out.normal = vec4<f32>(normalize(in.world_normal), 1.0);
    out.metal_rough = vec4<f32>(0.0, 0.4, 0.0, 0.0);
    out.emissive = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    return out;
}
`;

async function main() {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  const rendererOptions: RendererOptions = {
    shadowDirectionalDepthBias: 50000,
    shadowSpotDepthBiasSlopeScale: 2.0,
  };
  const renderer = await Renderer.create(canvas, rendererOptions);
  const device = renderer.getDevice();

  // 16-byte uniform buffer holding elapsed time (f32 + 12 bytes padding)
  const timeBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const materialManager = renderer.getMaterialManager();

  const world = new World();
  const scene = new Scene("test");

  // Camera
  const cameraFar = 100.0;
  const camera = new Camera(device, "main", {
    fov: Math.PI / 4,
    aspect: canvas.clientWidth / canvas.clientHeight,
    near: 0.1,
    far: cameraFar,
  });
  camera.transform.setPosition(0, 4, -12);
  camera.transform.lookAt(new Vec3(0, 1, 0));
  scene.add(camera);

  const flyControls = new FlyControls(canvas, camera);
  const time = new Time();

  // Floor
  const floorGeo = createPlaneGeometry(device, 30, 30);
  const floorMat = new MaterialBasic(device, "floor", {
    color: [0.28, 0.36, 0.22, 1.0],
  });
  const floor = new Mesh(device, "floor", floorGeo, floorMat);
  scene.add(floor);

  // Shared sphere geometry
  const sphereGeo = createSphereGeometry(device, 1, 48);

  // Basic sphere
  const basicMat = new MaterialBasic(device, "basic-sphere", {
    color: [0.8, 0.1, 0.1, 1.0],
  });
  await materialManager.loadMaterial(basicMat);
  const basicSphere = new Mesh(device, "basic-sphere", sphereGeo, basicMat);
  basicSphere.transform.setPosition(-7, 1, 0);
  scene.add(basicSphere);

  // PBR sphere — textures dropped into test/assets/pbr/ when testing
  const pbrMat = new MaterialPBR(device, "pbr-metal", {
    albedoTexture: new Texture("./assets/pbr/albedo.jpg"),
    normalTexture: new Texture("./assets/pbr/normal.jpg"),
    metalnessRoughnessTexture: new Texture("./assets/pbr/arm.jpg"),
  });
  await materialManager.loadMaterial(pbrMat);
  const pbrSphere = new Mesh(device, "pbr-sphere", sphereGeo, pbrMat);
  pbrSphere.transform.setPosition(-3.5, 1, 0);
  scene.add(pbrSphere);

  // Reflection probe sphere — probe is attached after first render
  const probeMat = new MaterialPBR(device, "pbr-probe", {
    baseColorFactor: [0.9, 0.9, 0.9, 1.0],
  });
  await materialManager.loadMaterial(probeMat);
  const probeSphere = new Mesh(device, "probe-sphere", sphereGeo, probeMat);
  probeSphere.transform.setPosition(0, 1, 0);
  scene.add(probeSphere);

  const probe = new ReflectionProbe("scene-probe");
  probe.resolution = 256;
  probe.updateFrequency = 1;
  probeSphere.transform.addChild(probe.transform);
  scene.add(probe);

  // UV debug sphere via MaterialBasic hook (custom shading without custom pipeline)
  const uvDebugMat = new MaterialBasic(device, "uv-debug", {
    color: [1, 1, 1, 1],
    hooks: {
      albedo: UV_DEBUG_ALBEDO_HOOK,
      functions: UV_DEBUG_FUNCTIONS_HOOK,
    },
  });
  const uvSphere = new Mesh(device, "uv-sphere", sphereGeo, uvDebugMat);
  uvSphere.transform.setPosition(3.5, 1, 0);
  scene.add(uvSphere);

  // Hook showcase sphere — exercises all four hooks: functions, albedo, albedo_logic, vertex_post_process
  const hookShowcaseMat = new MaterialBasic(device, "hook-showcase", {
    color: [1, 1, 1, 1],
    hooks: {
      functions: HOOK_SHOWCASE_FUNCTIONS,
      albedo: HOOK_SHOWCASE_ALBEDO,
      albedo_logic: HOOK_SHOWCASE_ALBEDO_LOGIC,
      vertex_post_process: HOOK_SHOWCASE_VERTEX,
    },
  });
  const hookShowcaseSphere = new Mesh(
    device,
    "hook-showcase-sphere",
    sphereGeo,
    hookShowcaseMat,
  );
  hookShowcaseSphere.transform.setPosition(7, 1, 0);
  scene.add(hookShowcaseSphere);

  // CustomMaterial sphere — step 4: bind group layout
  const customBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  // step 5: bind group
  const customBindGroup = device.createBindGroup({
    layout: customBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: timeBuffer } }],
  });

  // step 6: MaterialCustom
  const customMat = new MaterialCustom(device, "custom-time", {
    name: "custom-time",
    passes: { geometry: CUSTOM_MATERIAL_SHADER },
    bindGroupLayout: customBindGroupLayout,
    bindGroup: customBindGroup,
  });

  // step 7: load
  await materialManager.loadMaterial(customMat);

  // step 8: sphere mesh
  const customSphere = new Mesh(device, "custom-sphere", sphereGeo, customMat);
  customSphere.transform.setPosition(10.5, 1, 0);
  scene.add(customSphere);

  const sceneUniforms = renderer.getSceneUniforms();
  const ambient = 0.95;
  sceneUniforms.ambientLightColor = new Vec3(ambient, ambient, ambient);
  sceneUniforms.iblIntensity = 0.0;
  // Directional light — cascading shadow maps
  const sun = new DirectionalLight("sun");
  sun.transform.setPosition(-4, 8, 10);
  sun.transform.lookAt(new Vec3(0, 0, 0));
  sun.color = new Vec3(1.0, 0.95, 0.85);
  sun.intensity = 1.2;
  sun.offsetNear = cameraFar;
  scene.add(sun);

  // Spot light — warm amber pool
  const spot = new SpotLight("amber-spot");
  spot.transform.setPosition(6, 6, -4);
  spot.transform.lookAt(new Vec3(0, 0, 0));
  spot.color = new Vec3(1.0, 0.6, 0.2);
  spot.intensity = 3.0;
  spot.fov = 40;
  spot.near = 0.5;
  spot.far = 20;
  spot.penumbra = 0.3;
  scene.add(spot);

  // Smoke particles
  const smokeTex = new Texture("./assets/smoke.png");
  const gradientTex = new Texture("./assets/gradient_map_smoke.png");
  const smokeMat = new MaterialParticle();
  smokeMat.spriteTexture = smokeTex;
  smokeMat.gradientMapTexture = gradientTex;
  smokeMat.atlasRegionsX = 4;
  smokeMat.atlasRegionsY = 3;
  smokeMat.atlasRegionsTotal = 10;
  smokeMat.gradientMapCount = 512;
  await smokeMat.load();

  const smokeEmitter = new ParticleEmitter(
    device,
    "smoke",
    {
      spawnCount: 1,
      spawnRate: 1 / 4,
      // spawnPositions: [new Vec3(0, 0, 0)],
      // line up with spheres
      spawnPositions: [new Vec3(0, 1, 0)],
      spawnScales: [1.5],
      spawnRotations: [new Quat()],
      spawnVelocities: [new Vec3(0, 0, 0)],
      spawnLifetimes: [4.0],
      spawnAlphas: [0.8],
      spawnBillboards: [1],
    },
    1 * 4 + 1,
    smokeMat,
  );
  smokeEmitter.transform.setPosition(-3.5, 1, -5);
  scene.add(smokeEmitter);

  // Fog
  sceneUniforms.fogEnabled = true;
  sceneUniforms.fogColorBase = new Vec3(0.55, 0.58, 0.62);
  sceneUniforms.fogColorSun = new Vec3(0.98, 0.78, 0.48);
  sceneUniforms.fogExtinction = new Vec3(0.004, 0.004, 0.004);
  sceneUniforms.fogInscattering = new Vec3(0.006, 0.006, 0.006);
  sceneUniforms.fogSunExponent = 12.0;
  sceneUniforms.update();

  // Skybox
  const skybox = new CubeTexture(
    device,
    "./assets/environment/default",
    ".jpg",
  );
  await skybox.load();
  renderer.setSkyboxTexture(skybox);
  world.addScene(scene);

  let probeAttached = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    camera.resize(rect.width, rect.height);
  }

  window.addEventListener("resize", resize);
  resize();

  function loop() {
    time.update();

    flyControls.update(time.delta);
    world.step(time.delta);
    world.updateWorldMatrices();

    // Attach probe cube render target to material after the probe has been rendered once
    if (!probeAttached && probe.cubeRenderTarget) {
      probeMat.environmentTexture = probe.cubeRenderTarget;
      probeAttached = true;
    }

    smokeEmitter.updateParticles(device, time.delta);

    for (const instance of smokeEmitter.instances) {
      instance.gradientMapIndex = Math.floor(
        mapRange(
          instance.lifetime,
          instance.maxLifetime,
          0,
          0,
          smokeMat.gradientMapCount,
        ),
      );
      instance.atlasRegionIndex = Math.floor(
        mapRange(
          instance.lifetime,
          instance.maxLifetime,
          0,
          0,
          smokeMat.atlasRegionsTotal,
        ),
      );
    }

    // step 9: upload elapsed time to GPU each frame
    device.queue.writeBuffer(
      timeBuffer,
      0,
      new Float32Array([time.elapsed, 0, 0, 0]),
    );

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
