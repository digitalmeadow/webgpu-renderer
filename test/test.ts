import { Renderer, World, Scene, Camera, Time, Cube } from "../src/index";

async function main() {
  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas not found");
    return;
  }

  const renderer = new Renderer(canvas);
  await renderer.init();

  const device = renderer.getDevice();

  const world = new World();
  const scene = new Scene("Main Scene");
  world.addScene(scene);

  const mesh = new Cube(device);
  scene.add(mesh);

  const camera = new Camera(
    device,
    undefined,
    undefined,
    undefined,
    undefined,
    canvas.clientWidth / canvas.clientHeight,
  );

  const time = new Time();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);
    camera.resize(rect.width, rect.height);
  }

  window.addEventListener("resize", resize);

  function loop() {
    time.update();

    // Rotate the over time
    mesh.transform.setRotation(
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
