<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev)
[![React](https://img.shields.io/badge/React-18%2B-149eca.svg)](https://react.dev)
[![WebGPU](https://img.shields.io/badge/Shaders-WGSL-blueviolet.svg)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-@motion--core%2Fmotion--gpu-red.svg)](https://www.npmjs.com/package/@motion-core/motion-gpu)

</div>

# Motion GPU

**A tiny WebGPU runtime for writing Shadertoy-style fullscreen shaders in pure WGSL.**

`@motion-core/motion-gpu` ships a framework-agnostic core plus Svelte 5 and React adapters for building fullscreen shader pipelines using WebGPU and WGSL.
It provides a minimal runtime loop, scheduler, and render graph designed specifically for fragment-driven GPU programs.

Unlike general-purpose 3D engines, Motion GPU focuses on a very narrow problem: **running fullscreen fragment shaders and multi-pass GPU pipelines**.

---

# When to Use Motion GPU

Motion GPU is designed for applications where the entire scene is driven by fullscreen shaders.

Typical use cases include:

- Shadertoy-style GPU experiments
- Generative art
- Procedural textures
- Multi-pass post-processing pipelines
- GPU simulations
- Shader editors and live-coding tools
- Interactive visual experiments

If your application is primarily a fullscreen fragment shader pipeline, using a full 3D engine can add unnecessary complexity and bundle size.

---

# Why Not Use Three.js?

Three.js is a powerful general-purpose 3D engine.
Motion GPU focuses on a much narrower problem: running fullscreen WGSL shader pipelines.

| Feature          | Three.js              | Motion GPU                |
| ---------------- | --------------------- | ------------------------- |
| Scope            | Full 3D engine        | Fullscreen shader runtime |
| Shader language  | TSL / generated WGSL  | Native WGSL               |
| Bundle size      | large                 | tiny (3.5-5x smaller)     |
| Rendering model  | Scene graph           | GPU pipeline              |
| Shader pipeline  | materials             | explicit passes           |
| Multi-pass       | possible but indirect | first-class               |
| Shader debugging | generated shaders     | direct WGSL               |

Motion GPU is **not a replacement for Three.js**.

Instead, it is designed for cases where a full 3D engine would be unnecessary overhead.

---

# Core Workflow

Motion GPU follows a simple three-step flow:

1. Define an immutable material with `defineMaterial(...)`.
2. Render it with `<FragCanvas />`.
3. Drive runtime updates with `useFrame(...)`, `useMotionGPU()`, and `useTexture(...)`.

---

# What This Package Includes

- Fullscreen WebGPU renderer for WGSL fragment shaders
- Strict material contract and validation (`fn frag(uv: vec2f) -> vec4f`)
- Runtime uniform and texture updates without rebuilding the pipeline
- Frame scheduler with task ordering, stages, invalidation modes, diagnostics and profiling
- Render graph with built-in post-process passes:
  - `ShaderPass`
  - `BlitPass`
  - `CopyPass`

- Named render targets for multi-pass pipelines
- Structured error normalization with built-in overlay UI and custom renderer support
- Advanced runtime API for namespaced shared user context and scheduler presets

---

# Entrypoints

## Svelte adapter

`@motion-core/motion-gpu/svelte` exposes the runtime API for Svelte:

- `FragCanvas`
- `defineMaterial`
- `useMotionGPU`
- `useFrame`
- `useTexture`
- `ShaderPass`
- `BlitPass`
- `CopyPass`

Also exports runtime/core types:

- uniforms
- textures
- render passes
- scheduler
- loader types

---

`@motion-core/motion-gpu/svelte/advanced` re-exports everything above, plus:

- `useMotionGPUUserContext`
- `setMotionGPUUserContext`
- `applySchedulerPreset`
- `captureSchedulerDebugSnapshot`

---

## React adapter

`@motion-core/motion-gpu/react` exposes the runtime API for React:

- `FragCanvas`
- `defineMaterial`
- `useMotionGPU`
- `useFrame`
- `useTexture`
- `ShaderPass`
- `BlitPass`
- `CopyPass`

Also exports runtime/core types:

- uniforms
- textures
- render passes
- scheduler
- loader types

---

`@motion-core/motion-gpu/react/advanced` re-exports everything above, plus:

- `useMotionGPUUserContext`
- `setMotionGPUUserContext`
- `applySchedulerPreset`
- `captureSchedulerDebugSnapshot`

---

## Framework-agnostic core

`@motion-core/motion-gpu` (and explicit alias `@motion-core/motion-gpu/core`) exposes adapter-building primitives:

- `defineMaterial`
- `resolveMaterial`
- `createCurrentWritable`
- `createFrameRegistry`
- `createMotionGPURuntimeLoop`
- `loadTexturesFromUrls`
- `toMotionGPUErrorReport`
- `ShaderPass`
- `BlitPass`
- `CopyPass`

`@motion-core/motion-gpu/advanced` (and explicit alias `@motion-core/motion-gpu/core/advanced`) re-exports core plus:

- `applySchedulerPreset`
- `captureSchedulerDebugSnapshot`

---

# Requirements

- Svelte 5 is required only for the Svelte adapter entrypoints (`/svelte`, `/svelte/advanced`)
- React 18+ is required only for the React adapter entrypoints (`/react`, `/react/advanced`)
- A browser/runtime with WebGPU support
- Secure context (`https://` or `localhost`)

---

# Installation

```bash
npm i @motion-core/motion-gpu
```

---

# AI Documentation

MotionGPU documentation is also available for AI tools via [Context7](https://context7.com/motion-core/motion-gpu).

---

# Quick Start

## 1. Create a material and render it

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';

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

---

### React equivalent

```tsx
import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
	return vec4f(uv.x, uv.y, 0.25, 1.0);
}
`
});

export function App() {
	return (
		<div style={{ width: '100vw', height: '100vh' }}>
			<FragCanvas material={material} />
		</div>
	);
}
```

---

## 2. Add animated uniforms via `useFrame`

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
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
	import { useFrame } from '@motion-core/motion-gpu/svelte';

	useFrame((state) => {
		state.setUniform('uTime', state.time);
	});
</script>
```

```tsx
import { useFrame } from '@motion-core/motion-gpu/react';

export function Runtime() {
	useFrame((state) => {
		state.setUniform('uTime', state.time);
	});

	return null;
}
```

---

# Core Runtime Model

## Material Phase (compile-time contract)

`defineMaterial(...)` validates and freezes:

- WGSL fragment source
- Uniform declarations
- Texture declarations
- Compile-time `defines`
- Shader `includes`

A deterministic material signature is generated from resolved shader/layout metadata.

---

## Frame Phase (runtime updates)

Inside `useFrame(...)` callbacks you update per-frame values:

- `state.setUniform(name, value)`
- `state.setTexture(name, value)`
- `state.invalidate(token?)`
- `state.advance()`

---

## Renderer Phase

`FragCanvas` resolves material state, schedules tasks, and decides whether to render based on:

- `renderMode` (`always`, `on-demand`, `manual`)
- invalidation / advance state
- `autoRender`

---

# Hard Contracts and Validation Rules

These are enforced by runtime validation.

1. Material entrypoint must be:

```
fn frag(uv: vec2f) -> vec4f
```

2. `ShaderPass` fragment entrypoint must be:

```
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f
```

3. `useFrame()` and `useMotionGPU()` must be called inside `<FragCanvas>` subtree.

4. You can only set uniforms/textures that were declared in `defineMaterial(...)`.

5. Uniform/texture/include/define names must match WGSL-safe identifiers:

```
[A-Za-z_][A-Za-z0-9_]*
```

6. `needsSwap: true` is valid only for `input: 'source'` and `output: 'target'`.

7. Render passes cannot read from `input: 'canvas'`.

8. `maxDelta` and profiling window must be finite and greater than `0`.

---

# Pipeline Rebuild Rules

## Rebuilds renderer

- Material signature changes (shader/layout/bindings)
- `outputColorSpace` changes

---

## Does not rebuild renderer

- Runtime uniform value changes
- Runtime texture source changes
- Clear color changes
- Canvas resize (resources are resized/reallocated as needed)

---

# Development

Run from `packages/motion-gpu`:

```bash
bun run build
bun run check
bun run test
bun run test:e2e
bun run lint
bun run format
```

---

## Performance

```bash
bun run perf:core
bun run perf:core:check
bun run perf:core:baseline
bun run perf:runtime
bun run perf:runtime:check
bun run perf:runtime:baseline
```

---

# License

This project is licensed under the MIT License.

See the `LICENSE` file for details.
