import {
  Renderer,
  World,
  Scene,
  DirectionalLight,
  MaterialBasic,
  Mesh,
  Camera,
  FlyControls,
  Time,
  Vec3,
  ParticleEmitter,
  createDefaultParticleEmitterDesc,
  MaterialParticle,
  Texture,
  mapRange,
} from "../src";
import { createCubeGeometry, createPlaneGeometry } from "../src/geometries";

async function main() {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  const renderer = new Renderer(canvas);
  await renderer.init();

  const device = renderer.getDevice();
  const materialManager = renderer.getMaterialManager();

  const world = new World();
  world.ambientLightColor = new Vec3(0.3, 0.3, 0.3);
  const scene = new Scene("Main Scene");
  world.addScene(scene);

  // Directional light at an angle for shadow casting
  const light = new DirectionalLight("main light");
  light.transform.setPosition(5, 5, -5);
  light.transform.lookAt(new Vec3(0, 0, 0));
  light.intensity = 1.5;
  scene.add(light);

  // Create floor plane
  const floorGeometry = createPlaneGeometry(device, 20, 20);
  const floorMaterial = new MaterialBasic(device, "floor-material", {
    color: [0.4, 0.4, 0.4, 1.0],
    renderPass: "geometry",
  });
  await materialManager.loadMaterial(floorMaterial);
  // Assuming CreatePlaneGeometry generates a horizontal XZ plane
  const floor = new Mesh(device, "floor", floorGeometry, floorMaterial);
  floor.transform.setPosition(0, -0.1, 0);
  floor.transform.setRotation(0, 0, 0); // DONT FLIP IT!
  scene.add(floor);

  // Cube geometry
  const cubeGeometry = createCubeGeometry(device);

  // Shadow caster cube (elevated)
  const casterMaterial = new MaterialBasic(device, "caster-material", {
    color: [0.8, 0.2, 0.2, 1.0],
    renderPass: "geometry",
  });
  await materialManager.loadMaterial(casterMaterial);
  const casterCube = new Mesh(
    device,
    "caster-cube",
    cubeGeometry,
    casterMaterial,
  );
  casterCube.transform.setPosition(0, 1, 0);
  scene.add(casterCube);

  // Create particle emitter
  const particleDesc = createDefaultParticleEmitterDesc();
  particleDesc.spawnCount = 1;
  particleDesc.spawnRate = 1;
  particleDesc.spawnPositions = [[0, 0, 0]];
  particleDesc.spawnScales = [1];
  particleDesc.spawnVelocities = [
    [-0.3, 1.5, -0.3],
    [0, 1.5, 0],
    [0.3, 1.5, 0.3],
  ];
  particleDesc.spawnLifetimes = [2.0];
  particleDesc.spawnAlphas = [1.0];
  particleDesc.spawnBillboards = [1];

  // Create particle material with textures
  const particleMaterial = new MaterialParticle();
  particleMaterial.spriteTexture = new Texture("./assets/sprite.png");
  particleMaterial.gradientMapTexture = new Texture(
    "./assets/gradient-map.png",
  );
  particleMaterial.atlasRegionsX = 3;
  particleMaterial.atlasRegionsY = 2;
  particleMaterial.atlasRegionsTotal = 5;
  particleMaterial.gradientMapCount = 512;
  await particleMaterial.load();

  const particleEmitter = new ParticleEmitter(
    device,
    "fire",
    particleDesc,
    500,
    particleMaterial,
  );
  particleEmitter.transform.setPosition(0, 0.5, 5);
  scene.add(particleEmitter);

  const camera = new Camera(
    device,
    Vec3.create(0, 5, 10),
    Vec3.create(0, 0, 0),
    undefined,
    undefined,
    canvas.clientWidth / canvas.clientHeight,
    1.0,
    20.0,
  );

  // Initialize fly controls
  const flyControls = new FlyControls(canvas, camera);

  const time = new Time();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    camera.resize(rect.width, rect.height);
  }

  window.addEventListener("resize", resize);

  // Initial resize to set correct canvas and camera dimensions
  resize();

  function loop() {
    time.update();

    // Update fly controls
    flyControls.update(time.delta);

    // Rotate the caster cube
    casterCube.transform.setRotation(
      time.elapsed * 0.2,
      time.elapsed * 0.3,
      time.elapsed * 0.1,
    );

    // Custom Particle Spritesheet & Gradient Animation
    for (let i = 0; i < particleEmitter.instances.length; i++) {
      const instance = particleEmitter.instances[i];

      // 1. Sprite Sheet Animation Progress
      const mappedAtlas = mapRange(
        instance.lifetime,
        instance.maxLifetime,
        0,
        0,
        particleMaterial.atlasRegionsTotal,
      );

      instance.atlasRegionIndex = Math.floor(mappedAtlas);
      instance.frameLerp = mappedAtlas - instance.atlasRegionIndex;

      // 2. Gradient Map Animation Progress
      instance.gradientMapIndex = Math.floor(
        mapRange(
          instance.lifetime,
          instance.maxLifetime,
          0,
          0,
          particleMaterial.gradientMapCount,
        ),
      );
    }

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
