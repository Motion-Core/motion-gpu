# Testing and Quality Gates

`packages/fragkit` uses Vitest with `happy-dom` test environment.

## Current test scope

The package includes focused tests for:

- material creation/resolve/signature behavior
- shader wrapper generation and binding determinism
- uniform type inference, validation, layout, and packing
- texture normalization, sizing, mip levels, and source detection
- texture URL loader behavior and cache semantics
- render target resolution and signature stability
- error report classification
- frame registry scheduling and render policy logic
- `useFragkit` context wiring
- `useTexture` hook lifecycle and disposal
- `FragCanvas` WebGPU-unavailable error UX

## Validated command

```bash
bun run --cwd packages/fragkit test
```

Status from current run:

- 11 test files passed
- 46 tests passed

## Additional checks available in package scripts

- `bun run --cwd packages/fragkit check`
  - `svelte-check`
  - `publint`
- `bun run --cwd packages/fragkit lint`
  - `prettier --check`
  - `eslint`

## Quality notes

- many contracts are validated by explicit runtime errors (invalid uniform/texture names, mismatched values, bad dimensions)
- deterministic sorting/signatures reduce nondeterministic rebuild behavior
- diagnostics are surfaced directly in UI overlay for faster integration debugging
