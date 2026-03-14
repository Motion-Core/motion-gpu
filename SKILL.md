---
name: motion-gpu-svelte-wgsl
description: Build and edit Svelte 5 components that render WGSL with @motion-core/motion-gpu/svelte. Use when implementing or refactoring FragCanvas-based components, defineMaterial shaders, useFrame runtime logic, textures/useTexture workflows, render passes/targets, render-mode scheduling, or MotionGPU error handling and diagnostics.
---

# MotionGPU Svelte WGSL Skill

Use this skill to produce production-grade Svelte 5 components on top of `@motion-core/motion-gpu/svelte`.
Follow the workflow exactly and enforce runtime contracts strictly.

## Source of Truth

Treat the public package contract as authoritative:

- `@motion-core/motion-gpu/svelte` exports:
`FragCanvas`, `defineMaterial`, `useMotionGPU`, `useFrame`, `useTexture`, `BlitPass`, `CopyPass`, `ShaderPass`
- `@motion-core/motion-gpu/svelte/advanced` exports:
everything above plus
`useMotionGPUUserContext`, `setMotionGPUUserContext`, `applySchedulerPreset`, `captureSchedulerDebugSnapshot`
- `@motion-core/motion-gpu` and `@motion-core/motion-gpu/core` export framework-agnostic core primitives.
- `@motion-core/motion-gpu/advanced` and `@motion-core/motion-gpu/core/advanced` export core primitives plus scheduler helper utilities.
- Import only from public entrypoints above. Do not import from internal package paths (`/src`, `/lib/core`, etc.).
- Full documentation index for LLMs is available at:
`http://motion-gpu.dev/llms.txt`
- Use `llms.txt` when deeper reference is needed; it links to raw markdown docs for the full library.
- Official docs sections to consult when uncertain:
Getting Started, Defining Materials, Writing Shaders, Uniforms, Textures, Texture Loading, Render Passes, Render Targets, Render Modes, Frame Scheduler, Hooks and Context, Error Handling, FragCanvas Reference, API Reference.

If examples from app code conflict with exported runtime behavior, prefer exported API contracts.

## Hard Contracts

Enforce these constraints without exceptions:

1. Material shader entrypoint must be exactly:
`fn frag(uv: vec2f) -> vec4f`
2. `ShaderPass` shader entrypoint must be exactly:
`fn shade(inputColor: vec4f, uv: vec2f) -> vec4f`
3. Call `useFrame()` and `useMotionGPU()` only inside the `<FragCanvas>` subtree.
4. Declare all runtime-updated uniforms/textures in `defineMaterial(...)` first.
5. Use WGSL-safe identifiers only for uniforms/textures/defines/includes:
`[A-Za-z_][A-Za-z0-9_]*`
6. Use `needsSwap: true` only with `input: 'source'` and `output: 'target'`.
7. Never read from `input: 'canvas'` in render passes.
8. Use explicit `{ type: 'mat4x4f', value: [...] }` for matrix uniforms.
9. Keep `maxDelta > 0` and scheduler profiling window `> 0`.
10. Build materials via `defineMaterial(...)`; never handcraft `FragMaterial`.
11. In `manual` mode, call `advance()` to render; `invalidate()` alone does not render.
12. For `invalidation: { mode: 'on-change' }`, always provide `token`.
13. Read/write named pass slots only when declared in `renderTargets`.

## Component Architecture Pattern

Default to this two-component shape:

1. Canvas host component:
- Create stable `material` with `defineMaterial(...)`.
- Render `<FragCanvas {material}>`.
- Attach `passes`, `renderTargets`, `renderMode`, `onError` as needed.
2. Runtime child component:
- Call `useFrame(...)` for per-frame updates.
- Call `useMotionGPU()` for canvas/scheduler/render controls.
- Use `useTexture(...)` for URL texture IO.

Prefer this split even for simple effects. It keeps context usage valid and readable.

## Implementation Workflow

### 1. Classify the request

Pick one main mode:

- Static shader (no runtime updates).
- Animated shader (uniform updates in `useFrame`).
- Interactive shader (pointer/state-driven updates).
- Texture-driven shader (`useTexture` and `state.setTexture`).
- Post-processing pipeline (`ShaderPass`/`BlitPass`/`CopyPass`).
- Advanced scheduling/user context (`@motion-core/motion-gpu/svelte/advanced` for Svelte runtime APIs, `@motion-core/motion-gpu/advanced` for core scheduler helpers).

### 2. Design material boundary

Put in material:

- Fragment WGSL source.
- Uniform declarations and initial values.
- Texture declarations and sampler/upload defaults.
- `defines` for compile-time constants.
- `includes` for reusable WGSL chunks.

Put in runtime (`useFrame`):

- `state.setUniform(...)` for dynamic values.
- `state.setTexture(...)` for dynamic texture sources.
- `state.invalidate(...)` and `state.advance()` control.

### 3. Pick render cadence intentionally

Choose mode by behavior:

- `always`: continuous animation/video.
- `on-demand`: interaction or sporadic updates.
- `manual`: explicit frame stepping/testing/capture.

If using `on-demand`, define invalidation policy explicitly:

- Keep `autoInvalidate: true` for frame-driven effects.
- Use `autoInvalidate: false` + `invalidation: { mode: 'on-change', token: ... }` for state-driven redraws.

Render-mode semantics to keep in mind:

- `on-demand` renders one initial frame, then sleeps until invalidated.
- Switching to `on-demand` triggers one frame.
- `manual` ignores invalidation-only flow; require `advance()`.

### 4. Add error strategy at creation time

Always wire `onError`.
Keep default overlay in dev unless the task explicitly requires custom UI.
Disable overlay only when user asks for silent/custom error handling.

### 5. Validate before finalizing

Run checks available in the target application:

```bash
npm run check
npm run test
npm run lint
```

If the project uses another package manager, use equivalent commands (`pnpm`/`yarn`/`bun`).
If a script does not exist, run the closest available static/type/test checks and report exactly what was not run.

If touching `.svelte` files and `svelte-autofixer` is available, run:

```bash
npx @sveltejs/mcp svelte-autofixer <path-to-file>
```

## Authoring Rules by Domain

### WGSL

- Use `motiongpuFrame.time`, `motiongpuFrame.delta`, `motiongpuFrame.resolution` for frame data.
- Read user uniforms through `motiongpuUniforms.<name>`.
- Sample textures with generated pairs:
`uTex` and `uTexSampler`.
- Flip Y when mapping DOM pointer to UV:
`uvY = 1.0 - domNormalizedY`.

### Uniforms

- Prefer shorthand for scalar/vector:
`0`, `[x,y]`, `[x,y,z]`, `[x,y,z,w]`.
- Use explicit typed form for clarity and matrices.
- Keep types stable; type/shape changes require new material.

### Textures

- Set static sampling defaults in `defineMaterial({ textures })`.
- Use runtime `state.setTexture` for source changes.
- Update-mode guidance:
`once` for static images,
`onInvalidate` for event-driven updates,
`perFrame` for video/canvas streams.
- Use `null` safely to unbind user source (fallback texture remains valid).

### Includes and Defines

- Use `includes` for reusable shader functions.
- Keep include chunks non-empty and non-circular.
- Use `defines` for compile-time toggles and loop constants.
- Use typed integer defines for integer loops:
`{ type: 'i32', value: N }` or `{ type: 'u32', value: N }`.
- Expect renderer rebuild when define/include output changes.

### Scheduler and User Context

- Use `applySchedulerPreset(...)` when selecting `performance`, `balanced`, or `debug` scheduler behavior.
- Keep `diagnosticsEnabled` and `profilingEnabled` equal when overriding preset options.
- Keep `profilingWindow` finite and `> 0`.
- Use `setMotionGPUUserContext(namespace, value)` for shared canvas-subtree state.
- Remember default `setMotionGPUUserContext` conflict behavior is `existing: 'skip'`; pass `existing: 'replace'` or `existing: 'merge'` intentionally.
- Use `useMotionGPUUserContext(namespace?)` as read-only consumer API.

### Passes and Targets

- Start with `ShaderPass` unless copy/blit is sufficient.
- Use `CopyPass` when fast copy can apply; it falls back automatically.
- Use named `renderTargets` for multi-resolution or branching pipelines.
- Validate slot availability order: write before read in same frame plan.

## Canonical Templates

### Minimal animated component

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

### Interactive on-demand runtime

```svelte
<script lang="ts">
  import { useFrame, useMotionGPU } from '@motion-core/motion-gpu/svelte';

  const gpu = useMotionGPU();
  let x = 0.5;
  let y = 0.5;

  $effect(() => {
    gpu.renderMode.set('on-demand');
    const canvas = gpu.canvas;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      x = (e.clientX - rect.left) / rect.width;
      y = 1 - (e.clientY - rect.top) / rect.height;
      gpu.invalidate();
    };
    canvas.addEventListener('pointermove', onMove);
    return () => canvas.removeEventListener('pointermove', onMove);
  });

  useFrame((state) => {
    state.setUniform('uMouse', [x, y]);
  }, { autoInvalidate: false });
</script>
```

### Texture loading + binding

```svelte
<script lang="ts">
  import { useFrame, useTexture } from '@motion-core/motion-gpu/svelte';

  const loaded = useTexture(['/assets/albedo.png'], {
    colorSpace: 'srgb',
    generateMipmaps: true
  });

  useFrame((state) => {
    const tex = loaded.textures.current?.[0];
    state.setTexture('uAlbedo', tex ? { source: tex.source } : null);
  });
</script>
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
- If mode is `manual`, check `advance()` usage instead of invalidation.
6. Texture issues:
- Confirm source readiness (`readyState` for video).
- Check update mode and source dimensions.

## Quality Checklist Before Delivery

Ship only when all checks pass:

1. Keep shader contracts valid (`frag`/`shade` signatures).
2. Keep all runtime-updated keys predeclared in material.
3. Keep render mode and invalidation strategy intentional and documented in code.
4. Keep error handling present (`onError` at minimum).
5. Keep passes/targets slot routing valid.
6. Keep only public entrypoint imports (`@motion-core/motion-gpu/svelte`, `/svelte/advanced`, `/core`, `/core/advanced`, root core aliases).
7. Keep checks/tests executed or report clearly what was not run.
