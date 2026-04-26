import {
  Camera,
  DirectionalLight,
  FlyControls,
  MaterialBasic,
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
} from "../src";

const UV_DEBUG_ALBEDO_HOOK = `fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
  return vec4<f32>(uv.x, uv.y, 0.0, 1.0);
}`;

const UV_DEBUG_UNIFORMS_HOOK = `fn material_albedo_color() -> vec4<f32> {
  return vec4<f32>(1.0, 1.0, 1.0, 1.0);
}`;

async function main() {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  const renderer = await Renderer.create(canvas);
  const device = renderer.getDevice();
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
      uniforms: UV_DEBUG_UNIFORMS_HOOK,
    },
  });
  const uvSphere = new Mesh(device, "uv-sphere", sphereGeo, uvDebugMat);
  uvSphere.transform.setPosition(3.5, 1, 0);
  scene.add(uvSphere);

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
  spot.prenumbra = 0.3;
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
  const fog = renderer.getSceneUniforms();
  fog.fogEnabled = true;
  fog.fogColorBase = new Vec3(0.55, 0.58, 0.62);
  fog.fogColorSun = new Vec3(0.98, 0.78, 0.48);
  fog.fogExtinction = new Vec3(0.004, 0.004, 0.004);
  fog.fogInscattering = new Vec3(0.006, 0.006, 0.006);
  fog.fogSunExponent = 12.0;
  fog.update();

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

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
