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
import { MaterialManager, MaterialPBR, MaterialType } from "../../materials";
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
 * Uses standard WebGPU cube map convention (left-handed, +Z forward):
 * - Horizontal faces (+X, -X, +Z, -Z): Use standard up vector (0, 1, 0)
 * - Vertical faces (+Y, -Y): Use Z-axis up vectors (0, 0, ∓1)
 *
 * Per WebGPU spec: "When viewed from the inside, this results in a left-handed
 * coordinate system where +X is right, +Y is up, and +Z is forward."
 *
 * WebGPU cube texture faces:
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
    up: Vec3.create(0, 1, 0),
    name: "+X (right, yellow)",
  }, // +X (right)
  {
    target: Vec3.create(-1, 0, 0),
    up: Vec3.create(0, 1, 0),
    name: "-X (left, pink)",
  }, // -X (left)
  {
    target: Vec3.create(0, 1, 0),
    up: Vec3.create(0, 0, -1),
    name: "+Y (top, red)",
  }, // +Y (top)
  {
    target: Vec3.create(0, -1, 0),
    up: Vec3.create(0, 0, 1),
    name: "-Y (bottom, green)",
  }, // -Y (bottom)
  {
    target: Vec3.create(0, 0, 1),
    up: Vec3.create(0, 1, 0),
    name: "+Z (front, dark blue)",
  }, // +Z
  {
    target: Vec3.create(0, 0, -1),
    up: Vec3.create(0, 1, 0),
    name: "-Z (back, light blue)",
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
    // Create or get cube render target
    if (!probe.cubeRenderTarget) {
      probe.cubeRenderTarget = new CubeRenderTarget(
        this.device,
        probe.resolution,
      );
    }

    // Create geometry buffer for probe rendering
    // We create a new one each time to match the probe resolution
    this.geometryBuffer = new GeometryBuffer(
      this.device,
      probe.resolution,
      probe.resolution,
    );

    // Create skybox pass for rendering environment background
    // Always recreate to match the current geometry buffer size
    this.skyboxPass = new SkyboxPass(
      this.device,
      this.cameraBindGroupLayout,
      this.geometryBuffer,
    );
    this.skyboxPass.setSkyboxTexture(this.skyboxTexture);

    const cubeRenderTarget = probe.cubeRenderTarget;
    const probePosition = probe.transform.getWorldPosition();

    // Create cameras for each cube face
    const cameras = this.createCubeFaceCameras(
      probePosition,
      probe.near,
      probe.far,
    );

    // Collect all meshes from the world
    const allMeshes = this.collectMeshes(world);

    // Main command encoder for all cube faces
    const encoder = this.device.createCommandEncoder({
      label: "Reflection Probe Pass",
    });

    // Render each cube face
    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const config = CUBE_FACE_CONFIGS[faceIndex];

      const camera = cameras[faceIndex];
      camera.update();

      // Collect visible meshes for this face using frustum culling
      const visibleMeshes = this.collectVisibleMeshes(allMeshes, camera, probe);

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

      // 1. Clear cube face color (NOT depth!) - start with clean slate
      const clearCubeFaceEncoder = encoder.beginRenderPass({
        label: `Clear Cube Face ${faceIndex}`,
        colorAttachments: [
          {
            view: cubeRenderTarget.getFaceView(faceIndex),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        // NO depth attachment - don't touch G-buffer depth
      });
      clearCubeFaceEncoder.end();

      // 2. Geometry Pass - render geometry to G-buffer
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

      const lightingPassEncoder = encoder.beginRenderPass({
        label: `Probe Face ${faceIndex} Lighting`,
        colorAttachments: [
          {
            view: cubeRenderTarget.getFaceView(faceIndex),
            loadOp: "load", // Preserve the cleared background
            storeOp: "store",
          },
        ],
        // NO depth attachment - lighting pass is a fullscreen quad
      });

      // Access the pipeline from LightingPass (it's private, but we need it)
      const lightingPipeline = (this.lightingPass as any)
        .pipeline as GPURenderPipeline;

      lightingPassEncoder.setPipeline(lightingPipeline);
      lightingPassEncoder.setBindGroup(0, this.geometryBuffer.bindGroup);
      lightingPassEncoder.setBindGroup(1, camera.uniforms.bindGroup);
      lightingPassEncoder.setBindGroup(2, this.lightManager.lightingBindGroup);
      // Use probe-specific bind group that excludes custom environment textures
      // to prevent texture usage conflicts (probe's cube texture can't be both
      // render attachment and texture binding in same encoder)
      lightingPassEncoder.setBindGroup(
        3,
        this.sceneUniforms.getProbeBindGroup(),
      );
      lightingPassEncoder.draw(3);
      lightingPassEncoder.end();

      // 4. Skybox Pass - render environment background AFTER lighting
      // Fills in background where no geometry exists (depth = 1.0)
      // This matches the order in Renderer.ts (lines 564-571)
      if (this.skyboxPass && this.skyboxTexture) {
        this.skyboxPass.render(
          encoder,
          camera.uniforms.bindGroup,
          cubeRenderTarget.getFaceView(faceIndex),
        );
      }

      // 5. Forward Pass - render transparent objects
      // For now, skip forward pass in probes to simplify initial implementation
      // TODO: Add forward pass rendering for transparent objects in probes
    }

    cubeRenderTarget.generateMipmaps(encoder);

    // Submit all rendering commands
    this.device.queue.submit([encoder.finish()]);
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

    for (let i = 0; i < 6; i++) {
      const config = CUBE_FACE_CONFIGS[i];

      // Calculate target position (position + direction)
      const target = Vec3.create(
        position.x + config.target.x,
        position.y + config.target.y,
        position.z + config.target.z,
      );

      // Create camera with 90 degree FOV and 1:1 aspect ratio
      const camera = new Camera(this.device, `ReflectionProbe_Face${i}`, {
        fov: Math.PI / 2,
        aspect: 1.0,
        near,
        far,
      });
      camera.transform.setPosition(position.x, position.y, position.z);
      camera.transform.lookAt(target);

      cameras.push(camera);
    }

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
   * Also excludes meshes that use this probe's render target to avoid self-reflection
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

      // Skip meshes that use THIS probe's render target as their environment texture
      // This prevents self-reflection artifacts
      if (mesh.material && mesh.material.type === MaterialType.PBR) {
        const pbrMaterial = mesh.material as MaterialPBR;

        if (pbrMaterial.environmentTexture === probe.cubeRenderTarget) {
          continue;
        }
      }

      // Skip meshes that are children of the probe (avoid self-reflection)
      // Since the probe is parented to the mesh, we need to check if the mesh
      // is the parent of the probe (not if the mesh is a child of the probe)
      if (this.isMeshParentOfProbe(mesh, probe)) {
        continue;
      }

      // Frustum culling
      mesh.updateWorldAABB();
      if (aabbInFrustum(mesh.worldAABB, frustumPlanes)) {
        visibleMeshes.push(mesh);
      }
    }

    // return visibleMeshes;
    return allMeshes; // For testing, render all meshes without culling
  }

  /**
   * Check if a mesh is the parent (or ancestor) of the probe's transform hierarchy
   * Used to prevent self-reflection when the probe is parented to the mesh
   */
  private isMeshParentOfProbe(mesh: Mesh, probe: ReflectionProbe): boolean {
    let current = probe.transform.parent;

    while (current) {
      if (current === mesh.transform) {
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
