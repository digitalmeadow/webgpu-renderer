import {
  Renderer,
  World,
  Scene,
  DirectionalLight,
  Texture,
  MaterialPBR,
  MaterialBasic,
  Mesh,
  Camera,
  FlyControls,
  Time,
  Vec3,
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
  light.transform.setPosition(0, 10, 5);
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
  const floor = new Mesh(device, "floor", floorGeometry, floorMaterial);
  floor.transform.setPosition(0, 0.0, 0);
  floor.transform.setRotation(-Math.PI, 0, 0);
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

  const camera = new Camera(
    device,
    Vec3.create(0, 5, 10),
    Vec3.create(0, 0, 0),
    undefined,
    undefined,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    60.0,
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
      time.elapsed * 0.5,
      time.elapsed * 0.7,
      time.elapsed * 0.3,
    );

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
