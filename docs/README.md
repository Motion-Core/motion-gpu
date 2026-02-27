# Fragkit Documentation

This documentation covers the `fragkit` package in this repository (`packages/fragkit`).
It is based on the current source and tests in:

- `packages/fragkit/src/lib/*`
- `packages/fragkit/src/core/*.test.ts`
- `packages/fragkit/src/*.test.ts`

## Documentation Map

### Start here

- [Getting Started](./getting-started.md)
- [Public API Overview](./public-api.md)

### API Reference

- [FragCanvas Component](./reference/frag-canvas.md)
- [Hooks (`useFragkit`, `useFrame`, `useTexture`)](./reference/hooks.md)
- [Types Reference](./reference/types.md)

### Core Concepts

- [Materials and Shader Contract](./concepts/materials-and-shaders.md)
- [Uniforms](./concepts/uniforms.md)
- [Textures](./concepts/textures.md)
- [Render Loop and Scheduling](./concepts/render-loop-and-scheduling.md)
- [Render Targets and Passes](./concepts/render-targets-and-passes.md)
- [Error Handling and Diagnostics](./concepts/error-handling.md)

### Internals

- [Renderer Architecture](./internals/renderer-architecture.md)
- [Testing and Quality Gates](./internals/testing-and-quality.md)

## Scope

The package currently exports:

- `FragCanvas`
- `createMaterial`
- `useFragkit`
- `useFrame`
- `useTexture`
- exported type definitions from `core/types`, `core/material`, `core/texture-loader`, and hook/context modules

Internal helpers like `createRenderer`, `Portal`, and low-level utility modules are documented for understanding, but are not part of the package root public API.
