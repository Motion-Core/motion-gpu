![Motion GPU banner](apps/web/static/og-image.jpg)

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev)
[![WebGPU](https://img.shields.io/badge/Shaders-WGSL-blueviolet.svg)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-@motion--core%2Fmotion--gpu-red.svg)](https://www.npmjs.com/package/@motion-core/motion-gpu)

</div>

# Motion GPU

`@motion-core/motion-gpu` is a Svelte 5 package for rendering fullscreen WGSL shaders with WebGPU, plus a runtime scheduler, texture pipeline, and post-processing render graph.

It is built around one core flow:

1. Define an immutable material with `defineMaterial(...)`.
2. Render it with `<FragCanvas />`.
3. Drive runtime updates with `useFrame(...)`, `useMotionGPU()`, and `useTexture(...)`.

## What This Package Includes

- Fullscreen WebGPU renderer for WGSL fragment shaders.
- Strict material contract and validation (`fn frag(uv: vec2f) -> vec4f`).
- Runtime uniform and texture updates without rebuilding the pipeline.
- Frame scheduler with task ordering, stages, invalidation modes, diagnostics and profiling.
- Render graph with built-in post-process passes:
  - `ShaderPass`
  - `BlitPass`
  - `CopyPass`
- Named render targets for multi-pass pipelines.
- Structured error normalization with built-in overlay UI and custom renderer support.
- Advanced runtime API for namespaced shared user context and scheduler presets.

## Entrypoints

### Root (`@motion-core/motion-gpu`)

Primary runtime API:

- `FragCanvas`
- `defineMaterial`
- `useMotionGPU`
- `useFrame`
- `useTexture`
- `ShaderPass`
- `BlitPass`
- `CopyPass`

Also exports runtime/core types (uniforms, textures, render passes, scheduler, loader types).

### Advanced (`@motion-core/motion-gpu/advanced`)

Re-exports everything from root, plus:

- `useMotionGPUUserContext`
- `setMotionGPUUserContext`
- `applySchedulerPreset`
- `captureSchedulerDebugSnapshot`

## Requirements

- Svelte 5 (`peerDependency: svelte ^5`)
- A browser/runtime with WebGPU support
- Secure context (`https://` or localhost)

## Installation

```bash
npm i @motion-core/motion-gpu
```

## Quick Start

### 1. Create a material and render it

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
  return vec4f(uv.x, uv.y, 0.25, 1.0);
}
`
	});
</script>

<div style="width: 100vw; height: 100vh;">
	<FragCanvas {material} />
</div>
```

### 2. Add animated uniforms via `useFrame`

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu';
	import Runtime from './Runtime.svelte';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
  let wave = 0.5 + 0.5 * sin(motiongpuUniforms.uTime + uv.x * 8.0);
  return vec4f(vec3f(wave), 1.0);
}
`,
		uniforms: {
			uTime: 0
		}
	});
</script>

<FragCanvas {material}>
	<Runtime />
</FragCanvas>
```

```svelte
<!-- Runtime.svelte -->
<script lang="ts">
	import { useFrame } from '@motion-core/motion-gpu';

	useFrame((state) => {
		state.setUniform('uTime', state.time);
	});
</script>
```

## Core Runtime Model

### Material phase (compile-time contract)

`defineMaterial(...)` validates and freezes:

- WGSL fragment source
- Uniform declarations
- Texture declarations
- Compile-time `defines`
- Shader `includes`

A deterministic material signature is generated from resolved shader/layout metadata.

### Frame phase (runtime updates)

Inside `useFrame(...)` callbacks, you update per-frame values:

- `state.setUniform(name, value)`
- `state.setTexture(name, value)`
- `state.invalidate(token?)`
- `state.advance()`

### Renderer phase

`FragCanvas` resolves material state, schedules tasks, and decides whether to render based on:

- `renderMode` (`always`, `on-demand`, `manual`)
- invalidation / advance state
- `autoRender`

## Hard Contracts and Validation Rules

These are enforced by runtime validation:

1. Material entrypoint must be:
   - `fn frag(uv: vec2f) -> vec4f`
2. `ShaderPass` fragment entrypoint must be:
   - `fn shade(inputColor: vec4f, uv: vec2f) -> vec4f`
3. `useFrame()` and `useMotionGPU()` must be called inside `<FragCanvas>` subtree.
4. You can only set uniforms/textures that were declared in `defineMaterial(...)`.
5. Uniform/texture/include/define names must match WGSL-safe identifiers:
   - `[A-Za-z_][A-Za-z0-9_]*`
6. `needsSwap: true` is valid only for `input: 'source'` and `output: 'target'`.
7. Render passes cannot read from `input: 'canvas'`.
8. `maxDelta` and profiling window must be finite and greater than `0`.

## Pipeline Rebuild Rules

### Rebuilds renderer

- Material signature changes (shader/layout/bindings)
- `outputColorSpace` changes

### Does not rebuild renderer

- Runtime uniform value changes
- Runtime texture source changes
- Clear color changes
- Canvas resize (resources are resized/reallocated as needed)

## Development (Package Scripts)

Run from `packages/motion-gpu`:

```bash
bun run build
bun run check
bun run test
bun run test:e2e
bun run lint
bun run format
```

Performance:

```bash
bun run perf:core
bun run perf:core:check
bun run perf:core:baseline
bun run perf:runtime
bun run perf:runtime:check
bun run perf:runtime:baseline
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
