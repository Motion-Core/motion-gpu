<div align="center">
  <img src="./icon.png" width="256" height="256" alt="Frame Icon" />
  <h1>Motion GPU</h1>
</div>

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte](https://img.shields.io/badge/Svelte-5-orange.svg)](https://svelte.dev)
[![React](https://img.shields.io/badge/React-18%2B-149eca.svg)](https://react.dev)
[![Vue](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org)
[![WebGPU](https://img.shields.io/badge/Shaders-WGSL-blueviolet.svg)](https://gpuweb.github.io/gpuweb/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org)
[![npm](https://img.shields.io/badge/npm-@motion--core%2Fmotion--gpu-red.svg)](https://www.npmjs.com/package/@motion-core/motion-gpu)

</div>

Motion GPU is a focused WebGPU library for fullscreen WGSL shaders. It gives you a
framework-neutral runtime and first-class adapters for Svelte, React, and Vue, without the scene
graph and 3D tooling of a general-purpose engine.

Use it for shader-driven visuals, generative art, procedural textures, post-processing, feedback
effects, and GPU compute. Motion GPU handles the canvas, render loop, scheduling, and GPU resources
while your application owns the shaders and interaction.

## Install

```bash
npm install @motion-core/motion-gpu
```

Import from the entry point that matches your application:

| Application           | Entry point                      |
| --------------------- | -------------------------------- |
| Framework-independent | `@motion-core/motion-gpu`        |
| Svelte                | `@motion-core/motion-gpu/svelte` |
| React                 | `@motion-core/motion-gpu/react`  |
| Vue                   | `@motion-core/motion-gpu/vue`    |

## What you get

- Validated WGSL materials for fullscreen rendering
- Runtime updates for uniforms, textures, and storage buffers
- Render, feedback, and compute passes for multi-step GPU work
- Explicit render modes and a scheduler for frame-level control
- The same core API across Svelte, React, and Vue

## Before you start

Motion GPU needs WebGPU and a secure context such as HTTPS or localhost. It is built for fullscreen
shader and compute workflows. If your project needs meshes, cameras, lighting, or a scene graph, a
3D engine will be a better fit.

## Documentation

[Start with the installation guide](https://motion-gpu.dev/docs/getting-started), then use the
[full documentation](https://motion-gpu.dev/docs) for materials, shaders, passes, runtime behavior,
and API contracts. You can also explore complete applications in the
[playground](https://motion-gpu.dev/playground).

AI tools can access the documentation through
[Context7](https://context7.com/motion-core/motion-gpu).

## License

Motion GPU is available under the [MIT License](./LICENSE).
