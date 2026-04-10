---
name: motion-gpu-adapters-wgsl
description: Build and edit MotionGPU code across framework-agnostic core and Svelte/React/Vue adapters. Use when implementing or refactoring FragCanvas-based components, defineMaterial shaders, useFrame runtime logic, textures/useTexture workflows, render passes/targets, compute shaders/storage buffers, render-mode scheduling, or MotionGPU error handling and diagnostics.
---

# MotionGPU Core + Adapters Skill

Use this skill to produce production-grade MotionGPU code across:
- framework-agnostic core (`@motion-core/motion-gpu`, `@motion-core/motion-gpu/core`),
- Svelte adapter (`@motion-core/motion-gpu/svelte`),
- React adapter (`@motion-core/motion-gpu/react`),
- Vue adapter (`@motion-core/motion-gpu/vue`).

Treat Svelte, React, and Vue as first-class adapters. Do not assume Svelte-only APIs.

## Source of Truth

Treat public package entrypoints as authoritative:

| Entrypoint | Layer | What it exposes |
| --- | --- | --- |
| `@motion-core/motion-gpu` | Core | Framework-agnostic runtime primitives (`defineMaterial`, `resolveMaterial`, scheduler/runtime builders, passes, texture loader, error normalization) |
| `@motion-core/motion-gpu/advanced` | Core | Core + scheduler helpers (`applySchedulerPreset`, `captureSchedulerDebugSnapshot`) |
| `@motion-core/motion-gpu/core` | Core | Same core API surface as root, explicit core path |
| `@motion-core/motion-gpu/core/advanced` | Core | Same advanced core helper surface |
| `@motion-core/motion-gpu/svelte` | Adapter | Svelte `FragCanvas`, hooks (`useMotionGPU`, `useFrame`, `usePointer`, `useTexture`), passes, material helpers |
| `@motion-core/motion-gpu/svelte/advanced` | Adapter | Svelte adapter + user context APIs + scheduler helpers |
| `@motion-core/motion-gpu/react` | Adapter | React `FragCanvas`, hooks (`useMotionGPU`, `useFrame`, `usePointer`, `useTexture`), passes, material helpers |
| `@motion-core/motion-gpu/react/advanced` | Adapter | React adapter + user context APIs + scheduler helpers |
| `@motion-core/motion-gpu/vue` | Adapter | Vue `FragCanvas`, composables (`useMotionGPU`, `useFrame`, `usePointer`, `useTexture`), passes, material helpers |
| `@motion-core/motion-gpu/vue/advanced` | Adapter | Vue adapter + user context APIs + scheduler helpers |

Advanced adapter exports:
- Svelte, React, and Vue advanced entrypoints export:
  - `useMotionGPUUserContext`
  - `setMotionGPUUserContext`
  - `applySchedulerPreset`
  - `captureSchedulerDebugSnapshot`
- React advanced additionally exports:
  - `useSetMotionGPUUserContext`

Import only from public entrypoints above. Never import from internal package paths (`/src`, `/lib/core`, etc.).

Documentation sources:
- LLM docs index: `http://motion-gpu.dev/llms.txt`
- Docs generated from source live under `apps/web/src/routes/docs`

If examples conflict with exported runtime behavior, prefer exported API contracts from entrypoints.

## Adapter Differences (Must Be Preserved)

When writing or refactoring code, keep these differences explicit.

### `FragCanvas` props

Shared runtime props (all adapters):
- `material`, `renderTargets`, `passes`, `clearColor`, `outputColorSpace`, `renderMode`, `autoRender`, `maxDelta`, `adapterOptions`, `deviceDescriptor`, `showErrorOverlay`, `onError`, `errorHistoryLimit`, `onErrorHistory`

Adapter-specific differences:
- Svelte:
  - `class?: string`
  - `style?: string`
  - `children?: Snippet`
  - `errorRenderer?: Snippet<[MotionGPUErrorReport]>`
- React:
  - `className?: string`
  - `style?: React.CSSProperties`
  - `children?: ReactNode`
  - `errorRenderer?: (report: MotionGPUErrorReport) => ReactNode`
- Vue:
  - `canvasClass?: string`
  - `canvasStyle?: string | Record<string, string | number>`
  - default slot for children
  - `#errorRenderer="{ report }"` scoped slot for custom error UI

### User context writes

- All adapters support `setMotionGPUUserContext(namespace, valueOrFactory, options?)`.
- React additionally supports `useSetMotionGPUUserContext()` and should prefer it for effect/event-handler writes.
- `SetMotionGPUUserContextOptions` supports:
  - `existing?: 'skip' | 'replace' | 'merge'`
  - `functionValue?: 'factory' | 'value'`

### `useTexture` signature

- Shared return shape: `{ textures, loading, error, errorReport, reload }`
- Shared URL input: `string[] | () => string[]`
- Options input:
  - Svelte: `TextureLoadOptions | () => TextureLoadOptions`
  - React: `TextureLoadOptions`
  - Vue: `TextureLoadOptions | () => TextureLoadOptions`

### `usePointer` signature

- Shared return shape: `{ state, lastClick, resetClick }`
- Shared option highlights:
  - `requestFrame?: 'auto' | 'invalidate' | 'advance' | 'none'`
  - `capturePointer?: boolean`
  - `trackWhilePressedOutsideCanvas?: boolean`
  - click synthesis options (`clickEnabled`, `clickMaxDurationMs`, `clickMaxMovePx`, `clickButtons`)
  - callbacks: `onMove`, `onDown`, `onUp`, `onClick`
- Coordinate conventions:
  - `state.current.uv` uses shader-friendly Y-up (`0..1`)
  - `state.current.ndc` uses Y-up (`-1..1`)

## Hard Contracts

Enforce these constraints without exceptions:

1. Material shader entrypoint must be exactly:
`fn frag(uv: vec2f) -> vec4f`
2. `ShaderPass` shader entrypoint must be exactly:
`fn shade(inputColor: vec4f, uv: vec2f) -> vec4f`
3. `ComputePass` shader must contain `@compute @workgroup_size(...)` and a `fn compute(...)` entrypoint.
4. Call `useFrame()`, `useMotionGPU()`, and `usePointer()` only inside the `<FragCanvas>` subtree.
5. Declare all runtime-updated uniforms/textures in `defineMaterial(...)` first.
6. Use WGSL-safe identifiers for uniforms/textures/defines/includes/storage buffers:
`[A-Za-z_][A-Za-z0-9_]*`
7. Use `needsSwap: true` only with `input: 'source'` and `output: 'target'`.
8. Never read from `input: 'canvas'` in render passes.
9. Use explicit `{ type: 'mat4x4f', value: [...] }` for matrix uniforms.
10. Keep `maxDelta > 0` and scheduler profiling window `> 0`.
11. Build materials via `defineMaterial(...)`; never handcraft `FragMaterial`.
12. In `manual` mode, call `advance()` to render; `invalidate()` alone does not render.
13. For `invalidation: { mode: 'on-change' }`, always provide `token`.
14. Read/write named pass slots only when declared in `renderTargets`.
15. Declare all storage buffers in `defineMaterial({ storageBuffers })` before using `writeStorageBuffer`/`readStorageBuffer`.
16. Storage buffer `size` must be `> 0` and a multiple of 4.
17. `PingPongComputePass` `iterations` must be `>= 1`.
18. Compute passes do not participate in render pass slot routing (no `input`/`output`/`needsSwap`).

## Architecture Pattern

Default to host + runtime split in all adapters.

1. Host component:
- Create stable `material` with `defineMaterial(...)`.
- Render `FragCanvas` with `material`.
- Attach `passes`, `renderTargets`, `renderMode`, `onError` as needed.

2. Runtime child component:
- Call `useFrame(...)` for per-frame updates.
- Call `useMotionGPU()` for canvas/scheduler/render controls.
- Call `usePointer(...)` for normalized mouse/touch/pen input and click snapshots.
- Use `useTexture(...)` for URL texture IO.

Prefer this split even for simple effects. It keeps context usage valid and readable.

## Implementation Workflow

### 1. Classify request

Pick one main mode:
- Static shader (no runtime updates).
- Animated shader (uniform updates in `useFrame`).
- Interactive shader (pointer/state-driven updates).
- Texture-driven shader (`useTexture` and `state.setTexture`).
- Post-processing pipeline (`ShaderPass`/`BlitPass`/`CopyPass`).
- Compute shader (`ComputePass`/`PingPongComputePass` with storage buffers).
- Advanced scheduling/user context (advanced entrypoints).

### 2. Pick layer and adapter

- If building framework runtime usage, pick adapter entrypoint (`/svelte`, `/react`, or `/vue`).
- If building framework-independent tooling, adapter internals, or low-level integrations, use core entrypoints (`@motion-core/motion-gpu` or `/core`).
- If adapter is not explicitly stated:
  - follow existing imports/files in the target codebase,
  - preserve current adapter,
  - avoid mixing adapter APIs in one component.

### 3. Design material boundary

Put in material:
- Fragment WGSL source.
- Uniform declarations and initial values.
- Texture declarations and sampler/upload defaults.
- Storage buffer declarations (`storageBuffers`) with size, type, access mode, and optional `initialData`.
- `defines` for compile-time constants.
- `includes` for reusable WGSL chunks.

Put in runtime (`useFrame`):
- `state.setUniform(...)` for dynamic values.
- `state.setTexture(...)` for dynamic texture sources.
- `state.writeStorageBuffer(name, data, { offset? })` to write CPU data to GPU storage buffers.
- `state.readStorageBuffer(name)` to read GPU storage buffer data back (`Promise<ArrayBuffer>`).
- `state.invalidate(...)` and `state.advance()` control.

### 4. Pick render cadence intentionally

Choose mode by behavior:
- `always`: continuous animation/video.
- `on-demand`: interaction or sporadic updates.
- `manual`: explicit frame stepping/testing/capture.

If using `on-demand`, define invalidation policy explicitly:
- Keep `autoInvalidate: true` for frame-driven effects.
- Use `autoInvalidate: false` + `invalidation: { mode: 'on-change', token: ... }` for state-driven redraws.

Render-mode semantics:
- `on-demand` renders one initial frame, then sleeps until invalidated.
- Switching to `on-demand` triggers one frame.
- `manual` ignores invalidation-only flow; requires `advance()`.

### 5. Add error strategy at creation time

Always wire `onError`.
Keep default overlay in dev unless the task explicitly requires custom UI.
Disable overlay only when the user asks for silent/custom handling.

### 6. Validate before finalizing

Run checks available in the target package/app:

```bash
npm run check
npm run test
npm run lint
```

If repository scripts use other package manager commands, run equivalents (`pnpm`/`yarn`/`bun`).
If a script is missing, run closest available static/type/test checks and report what was not run.

If touching `.svelte` files and `svelte-autofixer` is available, run:

```bash
npx @sveltejs/mcp svelte-autofixer <path-to-file>
```

## Authoring Rules by Domain

### WGSL

- Use `motiongpuFrame.time`, `motiongpuFrame.delta`, `motiongpuFrame.resolution` for frame data.
- Read user uniforms through `motiongpuUniforms.<name>`.
- Sample textures with generated pairs: `uTex` and `uTexSampler`.
- `usePointer().state.current.uv` already provides Y-up UV; flip Y manually only for custom DOM event wiring.

### Uniforms

- Prefer shorthand for scalar/vector: `0`, `[x,y]`, `[x,y,z]`, `[x,y,z,w]`.
- Use explicit typed form for clarity and matrices.
- Keep types stable; type/shape changes require new material.

### Textures

- Set static sampling defaults in `defineMaterial({ textures })`.
- Use runtime `state.setTexture` for source changes.
- Update-mode guidance:
  - `once` for static images,
  - `onInvalidate` for event-driven updates,
  - `perFrame` for video/canvas streams.
- Use `null` safely to unbind user source (fallback texture remains valid).

### Includes and Defines

- Use `includes` for reusable shader functions.
- Keep include chunks non-empty and non-circular.
- Use `defines` for compile-time toggles and loop constants.
- Use typed integer defines for integer loops:
`{ type: 'i32', value: N }` or `{ type: 'u32', value: N }`.
- Expect renderer rebuild when define/include output changes.

### Scheduler and User Context

- Use `applySchedulerPreset(...)` when selecting `performance`, `balanced`, or `debug` behavior.
- Keep `diagnosticsEnabled` and `profilingEnabled` equal when overriding preset options.
- Keep `profilingWindow` finite and `> 0`.
- Use `setMotionGPUUserContext(namespace, value)` for shared canvas-subtree state.
- Default conflict behavior is `existing: 'skip'`; pass `existing: 'replace'` or `existing: 'merge'` intentionally.
- In React, prefer `useSetMotionGPUUserContext()` for writes in effects and event handlers.
- Use `useMotionGPUUserContext(namespace?)` as read API.

### Passes and Targets

- Start with `ShaderPass` unless copy/blit is sufficient.
- Use `CopyPass` when fast copy can apply; it falls back automatically.
- Use named `renderTargets` for multi-resolution or branching pipelines.
- Validate slot availability order: write before read in same frame plan.

### Compute Shaders and Storage Buffers

- Declare storage buffers in `defineMaterial({ storageBuffers: { name: { size, type, access? } } })`.
- Use `ComputePass` for single-dispatch GPU compute; `PingPongComputePass` for iterative simulations.
- Compute passes run alongside render passes but do not read/write render pass slots.
- `dispatch` can be static tuple `[x, y?, z?]`, `'auto'`, or dynamic function.
- Use `state.writeStorageBuffer(name, data)` in `useFrame` to upload CPU data before compute.
- Use `state.readStorageBuffer(name)` to read back GPU results asynchronously.
- Storage buffers are bound at group(1) in compute shaders; storage textures at group(2).
- Fragment shaders can read storage buffers as read-only via `var<storage, read>` at group(1).
- `PingPongComputePass` generates two texture bindings from `target`:
  - `{target}A` sampled read texture at `@group(2) @binding(0)`
  - `{target}B` write storage texture at `@group(2) @binding(1)`
- `PingPongComputePass` requires target texture declared with `storage: true` and explicit `width`/`height`.

## Canonical Templates

### Svelte minimal animated component

```svelte
<script lang="ts">
  import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
  import Runtime from './Runtime.svelte';

  const material = defineMaterial({
    fragment: `
fn frag(uv: vec2f) -> vec4f {
  let t = 0.5 + 0.5 * sin(motiongpuUniforms.uTime + uv.x * 8.0);
  return vec4f(vec3f(t), 1.0);
}
`,
    uniforms: { uTime: 0 }
  });
</script>

<FragCanvas {material}>
  <Runtime />
</FragCanvas>
```

```svelte
<script lang="ts">
  import { useFrame } from '@motion-core/motion-gpu/svelte';

  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });
</script>
```

### React minimal animated component

```tsx
import { FragCanvas, defineMaterial, useFrame } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
  fragment: `
fn frag(uv: vec2f) -> vec4f {
  let t = 0.5 + 0.5 * sin(motiongpuUniforms.uTime + uv.x * 8.0);
  return vec4f(vec3f(t), 1.0);
}
`,
  uniforms: { uTime: 0 }
});

function Runtime() {
  useFrame((state) => {
    state.setUniform('uTime', state.time);
  });

  return null;
}

export function App() {
  return (
    <FragCanvas material={material}>
      <Runtime />
    </FragCanvas>
  );
}
```

### React advanced user-context write

```tsx
import { useSetMotionGPUUserContext } from '@motion-core/motion-gpu/react/advanced';

export function QualityButton() {
  const setUserContext = useSetMotionGPUUserContext();

  return (
    <button
      onClick={() => {
        setUserContext('config', { quality: 'medium' }, { existing: 'merge' });
      }}
    >
      Medium
    </button>
  );
}
```

## Debugging Playbook

Follow this order:

1. Contract errors:
- Verify `frag(...)` and `shade(...)` signatures first.
2. Missing runtime binding:
- Ensure names exist in `material.uniforms` or `material.textures`.
3. WGSL compile errors:
- Read normalized report from `onError`.
- Map error to fragment/include/define line.
4. Pass graph errors:
- Verify `needsSwap`, input/output slots, and target declarations.
5. No redraw in `on-demand`:
- Check invalidation path and `autoInvalidate` settings.
- If mode is `manual`, use `advance()`.
6. Texture issues:
- Confirm source readiness (`readyState` for video).
- Check update mode and source dimensions.
7. Compute shader errors:
- Verify `@compute @workgroup_size(...)` and `fn compute(...)`.
- Ensure storage buffers are declared before use.
- Check `writeStorageBuffer` offset + data size does not exceed buffer size.
- Verify dispatch dimensions match workgroup layout.

## Quality Checklist Before Delivery

Ship only when all checks pass:

1. Keep shader contracts valid (`frag`/`shade`/`compute` signatures).
2. Keep all runtime-updated keys predeclared in material.
3. Keep render mode and invalidation strategy intentional and documented.
4. Keep error handling present (`onError` at minimum).
5. Keep passes/targets routing valid.
6. Keep imports on public entrypoints only.
7. Keep storage buffer names declared before `writeStorageBuffer`/`readStorageBuffer` usage.
8. Keep adapter-specific API differences correct (`class` vs `className`, `errorRenderer`, `children`, `useSetMotionGPUUserContext`).
9. Keep checks/tests executed or report what was not run.
