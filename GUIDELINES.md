# WebGPU Renderer — Refactor Guidelines

`Camera.ts` and `CameraUniforms.ts` are the gold standard. Every other file in this package should be brought up to the same level. Use them as the reference when making any judgement call.

---

## Buffer Layout (`*Uniforms.ts` files)

### Use `GpuFloats`, `floatByteSize`, `alignVec4` from `src/utils/bufferLayout.ts`

Never write raw multipliers like `* 4`, `* 16`, or `* Float32Array.BYTES_PER_ELEMENT`. Use the shared primitives:

```ts
import { GpuFloats, floatByteSize, alignVec4 } from "../utils";
```

### Waterfall offset constants

Each offset derives from the previous one. This makes insertions local changes and makes the layout self-documenting:

```ts
const OFFSET_VIEW_MATRIX            = 0;
const OFFSET_PROJECTION_MATRIX      = OFFSET_VIEW_MATRIX           + GpuFloats.mat4;
const OFFSET_VIEW_PROJECTION_MATRIX = OFFSET_PROJECTION_MATRIX     + GpuFloats.mat4;
const OFFSET_POSITION               = OFFSET_VIEW_PROJECTION_MATRIX + GpuFloats.mat4;
const OFFSET_NEAR_FAR               = OFFSET_POSITION              + GpuFloats.vec4;
```

### Use `alignVec4` for padding, not magic `+ 2`

```ts
// Bad
const FLOAT_COUNT = OFFSET_NEAR_FAR + GpuFloats.vec2 + 2;

// Good
const FLOAT_COUNT = alignVec4(OFFSET_NEAR_FAR + GpuFloats.vec2);
```

### Name the total `FLOAT_COUNT`, derive `BUFFER_SIZE` from it

```ts
const FLOAT_COUNT = alignVec4(OFFSET_NEAR_FAR + GpuFloats.vec2);
const BUFFER_SIZE = floatByteSize(FLOAT_COUNT);
```

### Pre-allocate the CPU-side staging array

Name it `uniformData`. It is a `Float32Array(FLOAT_COUNT)` field on the class, never allocated per-frame:

```ts
private uniformData = new Float32Array(FLOAT_COUNT);
```

### Pass the typed array directly to `writeBuffer`

```ts
// Bad
this.device.queue.writeBuffer(this.buffer, 0, this.uniformData.buffer);

// Good
this.device.queue.writeBuffer(this.buffer, 0, this.uniformData);
```

---

## BindGroupLayout

### Export a free `create*BindGroupLayout(device)` function

Every module that owns a bind group layout exports a free function. Classes call it in their own constructor — passes that need the layout before an instance exists import and call the same function. No layout descriptors are duplicated.

### Cache with a module-level singleton

The free function caches its result at module scope to avoid creating duplicate GPU objects:

```ts
let _layout: GPUBindGroupLayout | null = null;

export function createCameraBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  if (!_layout) {
    _layout = device.createBindGroupLayout({ ... });
  }
  return _layout;
}
```

**Caveat:** the singleton persists across device resets. If device loss recovery is ever implemented, cached layouts must be invalidated.

---

## Dirty / Update Flags

### Use `needsUpdate`, never `dirty` or `isDirty`

The package convention is `needsUpdate: boolean`. The `dirty` suffix is not used anywhere in the package. Rename any `*dirty*` or `*Dirty*` to `*needsUpdate*` or `*NeedsUpdate*`.

### Own the optimisation at the right level

Dirty flags belong in the class that knows *why* something changed, not in the class that performs the write. Example: `projectionNeedsUpdate` lives in `Camera`, not `CameraUniforms`, because `Camera` is the one that knows when `fov`/`aspect`/`near`/`far` change.

`*Uniforms` classes should be stateless write helpers — no internal dirty tracking.

---

## Naming

### Fields

- `uniformData` — CPU-side staging `Float32Array` for uniform buffers
- `needsUpdate` — dirty flag (boolean)
- `projectionNeedsUpdate`, `viewNeedsUpdate` — specific dirty flags, follow the same pattern
- No leading underscores on private fields unless backing a getter (and even then, question whether the getter is necessary)

### Methods

- `update()` — main per-frame update entry point (on Entity subclasses)
- `updateProjection()`, `updateViewMatrices()` — private sub-updates, named after what they compute (not what they trigger)
- `destroy()` — GPU resource cleanup
- `markNeedsUpdate()` — external signal that something has changed

### Constants

- `OFFSET_*` — float-index offsets into a uniform buffer (e.g. `OFFSET_VIEW_MATRIX`)
- `FLOAT_COUNT` — total float count of a buffer
- `BUFFER_SIZE` — byte size derived from `FLOAT_COUNT`

### Getters vs public fields

- Use getters for **primitive** fields where external writes should be prevented (e.g. `fov`, `near`, `far` — mutations must go through `updateDesc()` to set `needsUpdate`)
- Use plain `public` fields for **mutable reference types** (e.g. `Mat4`) where getter protection is illusory anyway — the reference can always be mutated directly
- Match the convention of `Transform` — `worldMatrix`, `localMatrix` are plain public fields

---

## GPU Resource Labels

All GPU resources must have a `label`. Labels appear in browser GPU debugging tools and are essential for profiling. Format: `"ClassName: purpose"` or `"Descriptive Name"`.

```ts
device.createBuffer({ label: "Camera Uniforms Buffer", ... });
device.createBindGroup({ label: "Camera Bind Group", ... });
device.createBindGroupLayout({ label: "Camera Bind Group Layout", ... });
```

---

## General Code Style

- Comments explain *why*, not *what*. The code explains what.
- No decorative comment blocks or section dividers.
- Inline comments only where the intent is non-obvious (e.g. `// w = 1 (point, not vector)`).
- No `console.log` left in production code.
- TypeScript: prefer explicit types on class fields; rely on inference only for locals where the type is obvious from the RHS.
- No `any` casts without a comment explaining why.
- Imports: package imports first, then relative imports. Within relative imports, order by proximity (same dir before parent dirs).

---

## File Checklist

When refactoring a file, verify:

- [ ] Buffer offsets use `GpuFloats.*` waterfall constants
- [ ] `FLOAT_COUNT` and `BUFFER_SIZE` are named and derived correctly
- [ ] `alignVec4` used for padding instead of magic numbers
- [ ] `uniformData` is pre-allocated, passed directly (not `.buffer`) to `writeBuffer`
- [ ] BindGroupLayout exported as a cached free function
- [ ] Dirty flags named `*needsUpdate*`, owned at the right level
- [ ] No magic byte offsets (e.g. `writeBuffer(buf, 240, ...)`) — derive from `floatByteSize(OFFSET_*)`
- [ ] All GPU resources have labels
- [ ] No unexplained magic numbers anywhere
- [ ] Public mutable reference types are plain fields, not getter-wrapped privates
- [ ] Build passes: `npx tsc --noEmit`
