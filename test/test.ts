import {
  Renderer,
  World,
  Scene,
  DirectionalLight,
  Texture,
  MaterialPBR,
  MaterialStandardCustom,
  Mesh,
  Camera,
  Time,
  Vec3,
  AlphaMode,
} from "../src";
import { createCubeGeometry } from "../src/geometries";

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
  world.ambientLightColor = new Vec3(0.5, 0.5, 0.5);
  const scene = new Scene("Main Scene");
  world.addScene(scene);

  const light = new DirectionalLight("main light");
  light.transform.setPosition(0, 10, 0);
  light.transform.setRotation(-90, 0, 0);
  scene.add(light);

  const albedoTexture = new Texture(
    "https://upload.wikimedia.org/wikipedia/commons/b/b6/Image_created_with_a_mobile_phone.png",
  );
  const cubeGeometry = createCubeGeometry(device);

  // Standard Material Cube
  const standardMaterial = new MaterialPBR(device, "standard-material", {
    albedoTexture,
  });
  await materialManager.loadMaterial(standardMaterial);
  const standardCube = new Mesh(
    device,
    "standard-cube",
    cubeGeometry,
    standardMaterial,
  );
  scene.add(standardCube);

  // Custom Material Cube
  const customMaterial = new MaterialStandardCustom(device, "custom-material", {
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
  const customCube = new Mesh(
    device,
    "custom-cube",
    cubeGeometry,
    customMaterial,
  );
  customCube.transform.setPosition(2.5, 0, 0);
  scene.add(customCube);

  // Transparent Cube
  const transparentMaterial = new MaterialPBR(device, "transparent-material", {
    albedoTexture,
    opacity: 0.5,
    alphaMode: "blend" as AlphaMode,
  });
  await materialManager.loadMaterial(transparentMaterial);
  const transparentCube = new Mesh(
    device,
    "transparent-cube",
    cubeGeometry,
    transparentMaterial,
  );
  transparentCube.transform.setPosition(1, 0, 0);
  scene.add(transparentCube);

  const camera = new Camera(
    device,
    Vec3.create(0, 0, 10),
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

    // Rotate the transparent cube
    transparentCube.transform.setRotation(
      time.elapsed * 0.2,
      time.elapsed * 0.3,
      time.elapsed * 0.4,
    );

    renderer.render(world, camera, time);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main();
