import { Camera } from "../../camera";
import { Mesh } from "../../mesh";
import { Vec3, Mat4 } from "../../math";
import { ReflectionProbe } from "../../scene/ReflectionProbe";
import { World } from "../../scene/World";
import { GeometryBuffer } from "../GeometryBuffer";
import { GeometryPass } from "./GeometryPass";
import { LightingPass } from "./LightingPass";
import { ForwardPass } from "./ForwardPass";
import { SkyboxPass } from "./SkyboxPass";
import { MaterialManager } from "../../materials";
import { LightManager } from "../../lights/LightManager";
import { SceneUniforms } from "../../uniforms";
import { CubeRenderTarget } from "../../textures/CubeRenderTarget";
import { CubeTexture } from "../../textures/CubeTexture";
import { EntityType } from "../../scene/Entity";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../../math";

/**
 * Cube face directions and up vectors for creating cameras
 * Order: +X, -X, +Y, -Y, +Z, -Z
 *
 * IMPORTANT: This renderer uses a RIGHT-HANDED coordinate system with -Z FORWARD.
 * Standard cube map convention: All 4 horizontal faces use world-up (+Y),
 * only vertical faces (+Y/-Y) use special Z-axis up vectors.
 *
 * WebGPU cube texture faces follow OpenGL convention:
 * Face 0: +X, Face 1: -X, Face 2: +Y, Face 3: -Y, Face 4: +Z, Face 5: -Z
 *
 * Expected cube texture face colors (for debug):
 * - Face 0 (+X, right):  px = Yellow
 * - Face 1 (-X, left):   nx = Pink
 * - Face 2 (+Y, top):    py = Red
 * - Face 3 (-Y, bottom): ny = Green
 * - Face 4 (+Z, front):  pz = Blue
 * - Face 5 (-Z, back):   nz = Blur/Blue
 */
const CUBE_FACE_CONFIGS = [
  {
    target: Vec3.create(1, 0, 0),
    up: Vec3.create(0, 1, 0), // FIXED: All horizontal faces use world-up (+Y)
    name: "+X (right, yellow)",
  }, // +X (right)
  {
    target: Vec3.create(-1, 0, 0),
    up: Vec3.create(0, 1, 0), // FIXED: All horizontal faces use world-up (+Y)
    name: "-X (left, pink)",
  }, // -X (left)
  {
    target: Vec3.create(0, 1, 0),
    up: Vec3.create(0, 0, -1), // Vertical face: looking up, "back" is -Z (in -Z forward system)
    name: "+Y (top, red)",
  }, // +Y (top)
  {
    target: Vec3.create(0, -1, 0),
    up: Vec3.create(0, 0, 1), // Vertical face: looking down, "back" is +Z (in -Z forward system)
    name: "-Y (bottom, green)",
  }, // -Y (bottom)
  {
    target: Vec3.create(0, 0, 1),
    up: Vec3.create(0, 1, 0), // FIXED: All horizontal faces use world-up (+Y)
    name: "+Z (front, blue)",
  }, // +Z
  {
    target: Vec3.create(0, 0, -1),
    up: Vec3.create(0, 1, 0), // FIXED: All horizontal faces use world-up (+Y)
    name: "-Z (back, blur)",
  }, // -Z
];

export class ReflectionProbePass {
  private device: GPUDevice;
  private geometryBuffer: GeometryBuffer | null = null;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private forwardPass: ForwardPass;
  private skyboxPass: SkyboxPass | null = null;
  private materialManager: MaterialManager;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private cameraBindGroupLayout: GPUBindGroupLayout;
  private skyboxTexture: CubeTexture | null = null;

  constructor(
    device: GPUDevice,
    geometryPass: GeometryPass,
    lightingPass: LightingPass,
    forwardPass: ForwardPass,
    materialManager: MaterialManager,
    lightManager: LightManager,
    sceneUniforms: SceneUniforms,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ) {
    this.device = device;
    this.geometryPass = geometryPass;
    this.lightingPass = lightingPass;
    this.forwardPass = forwardPass;
    this.materialManager = materialManager;
    this.lightManager = lightManager;
    this.sceneUniforms = sceneUniforms;
    this.cameraBindGroupLayout = cameraBindGroupLayout;
  }

  setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
  }

  /**
   * Render the scene from the probe's perspective to all 6 cube faces
   */
  render(probe: ReflectionProbe, world: World): void {
    console.log(
      `[ReflectionProbePass] Starting render for probe "${probe.name}"`,
    );

    // Create or get cube render target
    if (!probe.cubeRenderTarget) {
      console.log(
        `[ReflectionProbePass] Creating new CubeRenderTarget for probe`,
      );
      probe.cubeRenderTarget = new CubeRenderTarget(
        this.device,
        probe.resolution,
      );
    }

    // Create geometry buffer for probe rendering
    // We create a new one each time to match the probe resolution
    console.log(
      `[ReflectionProbePass] Creating geometry buffer (${probe.resolution}x${probe.resolution})`,
    );
    this.geometryBuffer = new GeometryBuffer(
      this.device,
      probe.resolution,
      probe.resolution,
    );

    // Create skybox pass for rendering environment background
    if (!this.skyboxPass) {
      this.skyboxPass = new SkyboxPass(
        this.device,
        this.cameraBindGroupLayout,
        this.geometryBuffer,
      );
      this.skyboxPass.setSkyboxTexture(this.skyboxTexture);
    }

    const cubeRenderTarget = probe.cubeRenderTarget;
    const probePosition = probe.transform.getWorldPosition();
    console.log(`[ReflectionProbePass] Probe position:`, probePosition);

    // Create cameras for each cube face
    const cameras = this.createCubeFaceCameras(
      probePosition,
      probe.near,
      probe.far,
    );
    console.log(`[ReflectionProbePass] Created 6 cube face cameras`);

    // Collect all meshes from the world
    const allMeshes = this.collectMeshes(world);
    console.log(
      `[ReflectionProbePass] Collected ${allMeshes.length} total meshes from world`,
    );

    // Main command encoder for all cube faces
    const encoder = this.device.createCommandEncoder({
      label: "Reflection Probe Pass",
    });

    // Render each cube face
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const config = CUBE_FACE_CONFIGS[faceIndex];
      console.log(
        `[ReflectionProbePass] ========================================`,
      );
      console.log(
        `[ReflectionProbePass] Rendering Face ${faceIndex}/6: ${config.name}`,
      );
      console.log(
        `[ReflectionProbePass]   Expected: Should see ${config.name} wall`,
      );
      console.log(`[ReflectionProbePass]   Camera position:`, probePosition);
      console.log(`[ReflectionProbePass]   Target direction:`, config.target);
      console.log(`[ReflectionProbePass]   Up vector:`, config.up);

      const camera = cameras[faceIndex];
      console.log(
        `[ReflectionProbePass]   Computed target point:`,
        camera.target,
      );
      camera.update(this.device);

      // Collect visible meshes for this face using frustum culling
      const visibleMeshes = this.collectVisibleMeshes(allMeshes, camera, probe);
      console.log(
        `[ReflectionProbePass]   Face ${faceIndex}: ${visibleMeshes.length} visible meshes after culling`,
      );

      // Separate by alpha mode
      const opaqueMeshes = visibleMeshes.filter(
        (m) => m.material?.alphaMode === "opaque",
      );
      const alphaTestMeshes = visibleMeshes.filter(
        (m) => m.material?.alphaMode === "mask",
      );
      const ditherMeshes = visibleMeshes.filter(
        (m) => m.material?.alphaMode === "dither",
      );
      const blendMeshes = visibleMeshes.filter(
        (m) => m.material?.alphaMode === "blend",
      );

      console.log(`[ReflectionProbePass]   Face ${faceIndex} mesh breakdown:`, {
        opaque: opaqueMeshes.length,
        alphaTest: alphaTestMeshes.length,
        dither: ditherMeshes.length,
        blend: blendMeshes.length,
        total: visibleMeshes.length,
      });

      // 1. Geometry Pass - render to probe's geometry buffer
      const geometryPassMeshes = [...alphaTestMeshes, ...ditherMeshes];
      this.geometryPass.render(
        this.device,
        encoder,
        this.geometryBuffer,
        opaqueMeshes,
        geometryPassMeshes,
        camera,
        this.materialManager,
      );

      // 2. Lighting Pass - render directly to cube face
      const lightingPassEncoder = encoder.beginRenderPass({
        label: `Probe Face ${faceIndex} Lighting`,
        colorAttachments: [
          {
            view: cubeRenderTarget.getFaceView(faceIndex),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      // Access the pipeline from LightingPass (it's private, but we need it)
      const lightingPipeline = (this.lightingPass as any)
        .pipeline as GPURenderPipeline;

      lightingPassEncoder.setPipeline(lightingPipeline);
      lightingPassEncoder.setBindGroup(0, this.geometryBuffer.bindGroup);
      lightingPassEncoder.setBindGroup(1, camera.uniforms.bindGroup);
      lightingPassEncoder.setBindGroup(2, this.lightManager.lightingBindGroup);
      lightingPassEncoder.setBindGroup(3, this.sceneUniforms.bindGroup);
      lightingPassEncoder.draw(3);
      lightingPassEncoder.end();

      // 3. Skybox Pass - render environment background
      if (this.skyboxPass && this.skyboxTexture) {
        this.skyboxPass.render(
          encoder,
          camera.uniforms.bindGroup,
          cubeRenderTarget.getFaceView(faceIndex),
        );
      }

      // 4. Forward Pass - render transparent objects
      // For now, skip forward pass in probes to simplify initial implementation
      // TODO: Add forward pass rendering for transparent objects in probes

      console.log(
        `[ReflectionProbePass] ✅ Face ${faceIndex} rendering complete`,
      );
    }

    console.log(
      `[ReflectionProbePass] ========================================`,
    );
    console.log(`[ReflectionProbePass] 📊 CUBE FACE RENDERING SUMMARY:`);
    console.log(`[ReflectionProbePass] All 6 faces rendered. Expected output:`);
    console.log(
      `[ReflectionProbePass]   Face 0: Should show +X (right, YELLOW wall)`,
    );
    console.log(
      `[ReflectionProbePass]   Face 1: Should show -X (left, PINK wall)`,
    );
    console.log(
      `[ReflectionProbePass]   Face 2: Should show +Y (top, RED wall)`,
    );
    console.log(
      `[ReflectionProbePass]   Face 3: Should show -Y (bottom, GREEN wall)`,
    );
    console.log(
      `[ReflectionProbePass]   Face 4: Should show +Z (front, BLUE wall)`,
    );
    console.log(
      `[ReflectionProbePass]   Face 5: Should show -Z (back, BLUR wall)`,
    );
    console.log(
      `[ReflectionProbePass] ========================================`,
    );

    // Generate mipmaps
    console.log(
      `[ReflectionProbePass] Generating mipmaps for cube render target`,
    );
    cubeRenderTarget.generateMipmaps(encoder);

    // Submit all rendering commands
    this.device.queue.submit([encoder.finish()]);
    console.log(
      `[ReflectionProbePass] ✅ Probe rendering complete, commands submitted to GPU`,
    );
  }

  /**
   * Create 6 cameras for cube face rendering
   */
  private createCubeFaceCameras(
    position: Vec3,
    near: number,
    far: number,
  ): Camera[] {
    const cameras: Camera[] = [];

    console.log(
      `[ReflectionProbePass] Creating cube face cameras at position:`,
      position,
    );
    console.log(`[ReflectionProbePass] Near: ${near}, Far: ${far}`);

    for (let i = 0; i < 6; i++) {
      const config = CUBE_FACE_CONFIGS[i];

      // Calculate target position (position + direction)
      const target = Vec3.create(
        position.x + config.target.x,
        position.y + config.target.y,
        position.z + config.target.z,
      );

      console.log(`[ReflectionProbePass] Face ${i} (${config.name}):`);
      console.log(
        `[ReflectionProbePass]   Direction: (${config.target.x}, ${config.target.y}, ${config.target.z})`,
      );
      console.log(
        `[ReflectionProbePass]   Target point: (${target.x}, ${target.y}, ${target.z})`,
      );
      console.log(
        `[ReflectionProbePass]   Up vector: (${config.up.x}, ${config.up.y}, ${config.up.z})`,
      );

      // Create camera with 90 degree FOV and 1:1 aspect ratio
      const camera = new Camera(
        this.device,
        position.clone(),
        target,
        config.up.clone(),
        Math.PI / 2, // 90 degrees
        1.0, // 1:1 aspect ratio
        near,
        far,
      );

      cameras.push(camera);
    }

    console.log(
      `[ReflectionProbePass] ✅ Created ${cameras.length} cube face cameras`,
    );
    return cameras;
  }

  /**
   * Collect all meshes from the world
   */
  private collectMeshes(world: World): Mesh[] {
    const meshes: Mesh[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity.type === EntityType.Mesh) {
          meshes.push(entity as Mesh);
        }
      }
    }
    return meshes;
  }

  /**
   * Collect visible meshes for a cube face using frustum culling
   * Also excludes meshes that are children of the probe to avoid self-reflection
   */
  private collectVisibleMeshes(
    allMeshes: Mesh[],
    camera: Camera,
    probe: ReflectionProbe,
  ): Mesh[] {
    const visibleMeshes: Mesh[] = [];

    // Update world AABBs
    for (const mesh of allMeshes) {
      mesh.updateWorldAABB();
    }

    // Get camera frustum planes
    const frustumPlanes = frustumPlanesFromMatrix(camera.viewProjectionMatrix);

    for (const mesh of allMeshes) {
      // Skip disabled meshes
      if (!mesh.enabled) {
        continue;
      }

      // Skip meshes that are children of the probe (avoid self-reflection)
      if (this.isChildOfProbe(mesh, probe)) {
        continue;
      }

      // Frustum culling
      if (aabbInFrustum(mesh.geometry.aabb, frustumPlanes)) {
        visibleMeshes.push(mesh);
      }
    }

    return visibleMeshes;
  }

  /**
   * Check if a mesh is a child of the probe's transform hierarchy
   */
  private isChildOfProbe(mesh: Mesh, probe: ReflectionProbe): boolean {
    let current = mesh.transform.parent;

    while (current) {
      if (current === probe.transform) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  /**
   * Destroy resources
   */
  destroy(): void {
    if (this.geometryBuffer) {
      // GeometryBuffer doesn't have a destroy method, but we should clean up if needed
      this.geometryBuffer = null;
    }
  }
}
