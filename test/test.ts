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
  Time,
  Vec3,
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

  // Standard PBR Material Cube (Geometry Pass - Opaque)
  const pbrMaterial = new MaterialPBR(device, "pbr-material", {
    albedoTexture,
    renderPass: "geometry",
  });
  await materialManager.loadMaterial(pbrMaterial);
  const pbrCube = new Mesh(
    device,
    "pbr-cube",
    cubeGeometry,
    pbrMaterial,
  );
  scene.add(pbrCube);

  // Basic Material Cube (Geometry Pass - Simple color)
  const basicMaterial = new MaterialBasic(device, "basic-material", {
    color: [0.2, 0.8, 0.2, 1.0], // Green
    renderPass: "geometry",
  });
  await materialManager.loadMaterial(basicMaterial);
  const basicCube = new Mesh(
    device,
    "basic-cube",
    cubeGeometry,
    basicMaterial,
  );
  basicCube.transform.setPosition(2.5, 0, 0);
  scene.add(basicCube);

  // Transparent Material Cube (Forward Pass)
  const transparentMaterial = new MaterialPBR(device, "transparent-material", {
    albedoTexture,
    renderPass: "forward",
    opacity: 0.5,
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

    // Rotate the PBR cube
    pbrCube.transform.setRotation(
      time.elapsed * 0.5,
      time.elapsed * 0.7,
      time.elapsed * 0.3,
    );

    // Rotate the basic cube
    basicCube.transform.setRotation(
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
