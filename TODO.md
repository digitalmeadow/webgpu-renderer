# webgpu-renderer — Deferred Work

## Separate environment textures from SceneUniforms bind group

**Problem:** `SceneUniforms` currently bundles environment texture bindings (slots 3–4) into the scene bind group. During reflection probe rendering, the probe's own `CubeRenderTarget` may be bound as environment texture 1 while simultaneously being written to as a render attachment — a WebGPU sync error. The workaround is `getProbeBindGroup()`, which substitutes the skybox into slot 3–4 during probe passes.

**Desired solution:** Extract environment texture bindings into a dedicated `EnvironmentBindGroup` (new bind group slot). This eliminates the sync constraint entirely — the probe's render attachment and environment textures live in separate bind groups, so there's no conflict. `getProbeBindGroup()` and all associated invalidation logic can be removed.

**Scope of change:**
- New `EnvironmentBindGroup` / `EnvironmentUniforms` class
- All shaders updated (new group index for env textures)
- `LightingPass`, `ForwardPass`, `ReflectionProbePass` updated to bind the new group
- `SceneUniforms`: remove bindings 1–4 (keep only uniform buffer at binding 0), remove `getProbeBindGroup()`
- `MaterialManager.getEnvironmentTextures()` wires into new class instead of `SceneUniforms.setEnvironmentTextures()`
