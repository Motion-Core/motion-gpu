<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev)
[![React](https://img.shields.io/badge/React-18%2B-149eca.svg)](https://react.dev)
[![Vue](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org)
[![WebGPU](https://img.shields.io/badge/Shaders-WGSL-blueviolet.svg)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-@motion--core%2Fmotion--gpu-red.svg)](https://www.npmjs.com/package/@motion-core/motion-gpu)

</div>

**Motion GPU** is a minimalist WebGPU framework for writing Shadertoy-style fullscreen shaders in pure WGSL. It provides a framework-agnostic core with Svelte 5, React, and Vue adapters for building fragment-driven GPU programs and multi-pass rendering pipelines. The framework includes a minimal runtime loop, scheduler, and render graph tailored specifically for fullscreen shader execution, focusing on a narrow GPU workflow rather than general-purpose 3D rendering.

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

| Feature          | Three.js              | Motion GPU                  |
| ---------------- | --------------------- | --------------------------- |
| Scope            | Full 3D engine        | Fullscreen shader framework |
| Shader language  | TSL / generated WGSL  | Native WGSL                 |
| Bundle size      | 186 kB (gzip)         | 25.4 kB (gzip)              |
| Rendering model  | Scene graph           | GPU pipeline                |
| Shader pipeline  | materials             | explicit passes             |
| Multi-pass       | possible but indirect | first-class                 |
| Shader debugging | generated shaders     | direct WGSL                 |

Motion GPU is **not a replacement for Three.js**.

Instead, it is designed for cases where a full 3D engine would be unnecessary overhead.

**Note:** Bundle size figures are based on measurements from https://bundlejs.com/

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

- Fragment feedback passes:
  - `PingPongShaderPass` — iterative fullscreen fragment simulations with render-texture A/B alternation

- GPU compute passes:
  - `ComputePass` — single-dispatch GPU compute workloads
  - `PingPongComputePass` — iterative multi-step simulations with texture A/B alternation

- Named render targets for multi-pass pipelines
- Structured error normalization with built-in overlay UI and custom renderer support
- Advanced runtime API for namespaced shared user context and scheduler presets

---

# Requirements

- Svelte 5 is required only for the Svelte adapter entrypoints (`/svelte`, `/svelte/advanced`)
- React 19+ is required only for the React adapter entrypoints (`/react`, `/react/advanced`)
- Vue 3.5+ is required only for the Vue adapter entrypoints (`/vue`, `/vue/advanced`)
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

## 3. Add a GPU compute pass

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, defineMaterial, ComputePass } from '@motion-core/motion-gpu/svelte';
	import Runtime from './Runtime.svelte';

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
  let idx = u32(uv.x * 255.0);
  let particle = particles[idx];
  return vec4f(particle.rgb, 1.0);
}
`,
		storageBuffers: {
			particles: { size: 4096, type: 'array<vec4f>', access: 'read-write' }
		}
	});

	const simulate = new ComputePass({
		compute: `
@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let t = motiongpuFrame.time;
  particles[i] = vec4f(sin(t + f32(i)), cos(t + f32(i)), 0.0, 1.0);
}
`,
		dispatch: [16]
	});
</script>

<FragCanvas {material} passes={[simulate]}>
	<Runtime />
</FragCanvas>
```

```tsx
import { FragCanvas, defineMaterial, ComputePass } from '@motion-core/motion-gpu/react';

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
  let idx = u32(uv.x * 255.0);
  let particle = particles[idx];
  return vec4f(particle.rgb, 1.0);
}
`,
	storageBuffers: {
		particles: { size: 4096, type: 'array<vec4f>', access: 'read-write' }
	}
});

const simulate = new ComputePass({
	compute: `
@compute @workgroup_size(64)
fn compute(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let t = motiongpuFrame.time;
  particles[i] = vec4f(sin(t + f32(i)), cos(t + f32(i)), 0.0, 1.0);
}
`,
	dispatch: [16]
});

export function App() {
	return (
		<div style={{ width: '100vw', height: '100vh' }}>
			<FragCanvas material={material} passes={[simulate]} />
		</div>
	);
}
```

---

## 4. Add a fragment feedback pass

Use `PingPongShaderPass` when the simulation is naturally expressed as a fullscreen fragment shader that reads the previous texture state and writes the next one.

```svelte
<!-- App.svelte -->
<script lang="ts">
	import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/svelte';

	const feedbackShader = `
fn frag(uv: vec2f) -> vec4f {
  let previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);
  let pulse = smoothstep(0.04, 0.0, distance(uv, vec2f(0.5)));
  return max(previous * 0.96, vec4f(pulse, pulse * 0.4, 0.0, 1.0));
}
`;

	const material = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
  return textureSample(uTrail, uTrailSampler, uv);
}
`,
		textures: {
			uTrail: { format: 'rgba16float', filter: 'linear' }
		}
	});

	const trail = new PingPongShaderPass({
		fragment: feedbackShader,
		target: 'uTrail',
		width: 512,
		height: 512,
		format: 'rgba16float',
		iterations: 4
	});
</script>

<FragCanvas {material} passes={[trail]} />
```

```tsx
import { FragCanvas, PingPongShaderPass, defineMaterial } from '@motion-core/motion-gpu/react';

const feedbackShader = `
fn frag(uv: vec2f) -> vec4f {
  let previous = textureSampleLevel(motiongpuPrevious, motiongpuPreviousSampler, uv, 0.0);
  let pulse = smoothstep(0.04, 0.0, distance(uv, vec2f(0.5)));
  return max(previous * 0.96, vec4f(pulse, pulse * 0.4, 0.0, 1.0));
}
`;

const material = defineMaterial({
	fragment: `
fn frag(uv: vec2f) -> vec4f {
  return textureSample(uTrail, uTrailSampler, uv);
}
`,
	textures: {
		uTrail: { format: 'rgba16float', filter: 'linear' }
	}
});

const trail = new PingPongShaderPass({
	fragment: feedbackShader,
	target: 'uTrail',
	width: 512,
	height: 512,
	format: 'rgba16float',
	iterations: 4
});

export function App() {
	return (
		<div style={{ width: '100vw', height: '100vh' }}>
			<FragCanvas material={material} passes={[trail]} />
		</div>
	);
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
- Storage buffer declarations

A deterministic material signature is generated from resolved shader/layout metadata.

---

## Frame Phase (runtime updates)

Inside `useFrame(...)` callbacks you update per-frame values:

- `state.setUniform(name, value)`
- `state.setTexture(name, value)`
- `state.writeStorageBuffer(name, data, { offset? })`
- `state.readStorageBuffer(name)` — returns `Promise<ArrayBuffer>`
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

2. Fragment and `ShaderPass` colors are authored as straight alpha. Motion GPU premultiplies only at final canvas presentation so internal render targets and pass inputs remain straight-alpha.

3. `ShaderPass` fragment entrypoint must be:

```
fn shade(inputColor: vec4f, uv: vec2f) -> vec4f
```

4. `PingPongShaderPass` fragment entrypoint must be:

```
fn frag(uv: vec2f) -> vec4f
```

5. `PingPongShaderPass` `iterations` must be `>= 1`. Its `target` must reference a fragment-visible texture declared in `defineMaterial({ textures })` and must not be declared as a compute storage target.

6. `useFrame()` and `useMotionGPU()` must be called inside `<FragCanvas>` subtree.

7. You can only set uniforms/textures that were declared in `defineMaterial(...)`.

8. Uniform/texture/include/define names must match WGSL-safe identifiers:

```
[A-Za-z_][A-Za-z0-9_]*
```

9. `needsSwap: true` is valid only for `input: 'source'` and `output: 'target'`.

10. Render passes cannot read from `input: 'canvas'`.

11. `maxDelta` and profiling window must be finite and greater than `0`.

12. `ComputePass` shader must contain `@compute @workgroup_size(...)` and a `fn compute(...)` entrypoint with a `@builtin(global_invocation_id)` parameter.

13. `PingPongComputePass` `iterations` must be `>= 1`. The `target` must reference a texture declared with `storage: true` and explicit `width`/`height`.

14. Compute and fragment feedback passes do not participate in render pass slot routing (no `input`/`output`/`needsSwap`).

15. Storage buffer `size` must be `> 0` and a multiple of 4. All storage buffers must be declared in `defineMaterial({ storageBuffers })`.

---

# Pipeline Rebuild Rules

## Rebuilds renderer

- Material signature changes (shader/layout/bindings)
- `FragCanvas` `color` pipeline option changes

---

## Does not rebuild renderer

- Runtime uniform value changes
- Runtime texture source changes
- `PingPongShaderPass.setFragment(...)` changes (only that pass pipeline is rebuilt on next render)
- Clear color changes
- Canvas resize (resources are resized/reallocated as needed)

---

# Development

Run from `packages/motion-gpu`:

```bash
pnpm run build
pnpm run check
pnpm run test
pnpm run test:e2e
pnpm run lint
pnpm run format
```

---

## Performance

```bash
pnpm run perf:core
pnpm run perf:core:check
pnpm run perf:core:baseline
pnpm run perf:runtime
pnpm run perf:runtime:check
pnpm run perf:runtime:baseline
```

---

# License

This project is licensed under the MIT License.

See the `LICENSE` file for details.
