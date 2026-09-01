<div align="center">
  <h1>Spektral</h1>
</div>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev)
[![React](https://img.shields.io/badge/React-19-149eca.svg)](https://react.dev)
[![Vue](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org)
[![WebGPU](https://img.shields.io/badge/Shaders-WGSL-blueviolet.svg)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/npm/v/spektral.svg)](https://www.npmjs.com/package/spektral)

</div>

Spektral is a focused WebGPU library for fullscreen WGSL shaders. It gives you a
framework-neutral runtime and first-class adapters for Svelte, React, and Vue, without the scene
graph and 3D tooling of a general-purpose engine.

Use it for shader-driven visuals, generative art, procedural textures, post-processing, feedback
effects, and GPU compute. Spektral handles the canvas, render loop, scheduling, and GPU resources
while your application owns the shaders and interaction.

## Install

```bash
npm install spektral
```

Import from the entry point that matches your application:

| Application           | Entry point       |
| --------------------- | ----------------- |
| Framework-independent | `spektral`        |
| Svelte                | `spektral/svelte` |
| React                 | `spektral/react`  |
| Vue                   | `spektral/vue`    |

## What you get

- Validated WGSL materials for fullscreen rendering
- Runtime updates for uniforms, textures, and storage buffers
- Render, feedback, and compute passes for multi-step GPU work
- Explicit render modes and a scheduler for frame-level control
- Source-mapped shader diagnostics and inspectable render-graph snapshots
- The same core API across Svelte, React, and Vue

## Before you start

Spektral needs WebGPU and a secure context such as HTTPS or localhost. It is built for fullscreen
shader and compute workflows. If your project needs meshes, cameras, lighting, or a scene graph, a
3D engine will be a better fit.

## Documentation

[Start with the installation guide](https://spektral.madebyhex.com/docs/getting-started), then use the
[full documentation](https://spektral.madebyhex.com/docs) for materials, shaders, passes, runtime behavior,
and API contracts. You can also explore complete applications in the
[playground](https://spektral.madebyhex.com/playground).

AI tools can access the documentation through
[Context7](https://context7.com/kaltwrk/spektral).

## License

Spektral is available under the [MIT License](./LICENSE).
