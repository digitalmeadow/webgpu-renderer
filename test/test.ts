import {
  Renderer,
  World,
  Scene,
  Camera,
  Time,
  Cube,
  MaterialStandard,
  MaterialCustom,
  Texture,
} from "../src/index";

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
  const scene = new Scene("Main Scene");
  world.addScene(scene);

  // Standard Material Cube
  const standardCube = new Cube(device);
  const albedoTexture = new Texture(
    "https://upload.wikimedia.org/wikipedia/commons/b/b6/Image_created_with_a_mobile_phone.png",
  );
  const standardMaterial = new MaterialStandard("standard-material", {
    albedoTexture,
  });
  await materialManager.loadMaterial(standardMaterial);
  standardCube.material = standardMaterial;
  scene.add(standardCube);

  // Custom Material Cube
  const customCube = new Cube(device);
  customCube.transform.setPosition(2.5, 0, 0);
  const customMaterial = new MaterialCustom("custom-material", {
    albedo: `
      fn get_albedo_color(uv: vec2<f32>) -> vec4<f32> {
          // A simple procedural checkerboard pattern
          let checker_size = 10.0;
          let f = floor(uv * checker_size);
          let is_even = (f.x + f.y) % 2.0 == 0.0;
          if (is_even) {
              return vec4<f32>(0.8, 0.8, 0.8, 1.0);
          } else {
              return vec4<f32>(0.2, 0.2, 0.2, 1.0);
          }
      }
    `,
  });
  await materialManager.loadMaterial(customMaterial);
  customCube.material = customMaterial;
  scene.add(customCube);

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

    // Rotate the standard cube
    standardCube.transform.setRotation(
      time.elapsed * 0.5,
      time.elapsed * 0.7,
      time.elapsed * 0.3,
    );

    // Rotate the custom cube
    customCube.transform.setRotation(
      time.elapsed * 0.3,
      time.elapsed * 0.5,
      time.elapsed * 0.7,
    );

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
