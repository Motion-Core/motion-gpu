<div align="center">

# Motion GPU

**Svelte 5 + WebGPU runtime for fullscreen WGSL rendering, scheduling, and post-processing pipelines**

[![Bun](https://img.shields.io/badge/runtime-bun-black?logo=bun)](https://bun.sh)
[![Svelte](https://img.shields.io/badge/svelte-5-ff3e00?logo=svelte)](https://svelte.dev)
[![WebGPU](https://img.shields.io/badge/rendering-WebGPU-4f46e5)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

## Quick Start

```bash
bun install
bun run dev
```

Main workspace commands:

```bash
bun run dev
bun run build
bun run test
bun run check
bun run lint
```

## Technical Overview

`@motion-core/motion-gpu` is designed as a strict runtime pipeline with explicit contracts.

Core building blocks:

- `FragCanvas`: owns WebGPU device/context lifecycle and frame loop.
- `defineMaterial`: validates and preprocesses WGSL (`defines` + `includes`) and resolves deterministic signatures.
- `useFrame`: registers ordered frame tasks with invalidation policies and stage orchestration.
- Render graph: executes optional post-process passes (`BlitPass`, `CopyPass`, `ShaderPass`) with source/target ping-pong.
- Diagnostics layer: normalizes WebGPU/WGSL/runtime errors into readable reports.

Rendering flow:

```mermaid
flowchart LR
  A["Svelte UI + hooks"] --> B["Frame Scheduler\nuseFrame tasks"]
  B --> C["Material Resolver\nWGSL + uniforms + textures"]
  C --> D["WebGPU Renderer\nmain fullscreen pass"]
  D --> E["Render Graph\noptional post-processing passes"]
  E --> F["Canvas Output"]
```

Runtime characteristics:

- Deterministic material/pipeline signatures to control rebuilds.
- Strict uniform/texture validation and packing rules.
- Multiple render modes: `always`, `on-demand`, `manual`.
- Built-in profiling/diagnostics snapshot API in scheduler runtime.

## Public API Surface

Root package exports:

- `FragCanvas`
- `defineMaterial`
- `useMotionGPU`
- `useFrame`
- `useTexture`
- `BlitPass`, `CopyPass`, `ShaderPass`

Advanced entrypoint (`@motion-core/motion-gpu/advanced`) additionally exports:

- `useMotionGPUUserContext`
- advanced scheduler/user-context types


## Documentation

Full package documentation is available in [`docs/`](./docs):

- architecture and concepts
- material/texture systems
- scheduler and render modes
- pass graph and render targets
- API reference
- examples and production use cases

Start here: [`docs/README.md`](./docs/README.md)
