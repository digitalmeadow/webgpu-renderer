# webgpu-renderer — Deferred Work

## Full Renderer teardown / `destroy()`

**Problem:** `Renderer.destroy()` currently does not exist. Switching rendering modes (e.g. data viz platform swapping pipelines) requires destroying the old instance and spinning up a new one. Without `destroy()`, all GPU resources (textures, buffers, pipelines, bind groups) leak.

**Desired solution:** Add `destroy()` to every class that owns GPU resources, then cascade from `Renderer.destroy()` down through all passes, managers, and the geometry buffer.

**Scope of change:**
- `GeometryBuffer.destroy()` — destroy 5 G-buffer textures
- `Renderer.destroy()` — destroy post-pass/high-res textures, call `destroy()` on all sub-objects
- All passes (`GeometryPass`, `LightingPass`, `ShadowPass*`, `OcclusionPass*`, `ForwardPass`, `ParticlesPass`, `SkyboxPass`, `OutputPass`, `ReflectionProbePass`) — destroy pipelines, textures, buffers, bind groups
- `MaterialManager`, `LightManager`, `SceneUniforms` — destroy owned GPU buffers and textures
- External passes (`GBufferPass`, `PostPass` interfaces) — define optional `destroy()` in interface so `Renderer` can call it

---

## Separate environment textures from SceneUniforms bind group

**Problem:** `SceneUniforms` currently bundles environment texture bindings (slots 3–4) into the scene bind group. During reflection probe rendering, the probe's own `CubeRenderTarget` may be bound as environment texture 1 while simultaneously being written to as a render attachment — a WebGPU sync error. The workaround is `getProbeBindGroup()`, which substitutes the skybox into slot 3–4 during probe passes.

**Desired solution:** Extract environment texture bindings into a dedicated `EnvironmentBindGroup` (new bind group slot). This eliminates the sync constraint entirely — the probe's render attachment and environment textures live in separate bind groups, so there's no conflict. `getProbeBindGroup()` and all associated invalidation logic can be removed.

**Scope of change:**
- New `EnvironmentBindGroup` / `EnvironmentUniforms` class
- All shaders updated (new group index for env textures)
- `LightingPass`, `ForwardPass`, `ReflectionProbePass` updated to bind the new group
- `SceneUniforms`: remove bindings 1–4 (keep only uniform buffer at binding 0), remove `getProbeBindGroup()`
- `MaterialManager.getEnvironmentTextures()` wires into new class instead of `SceneUniforms.setEnvironmentTextures()`
