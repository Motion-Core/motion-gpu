# MotionGPU Performance Benchmarks

This folder contains the long-term performance reference for `@motion-core/motion-gpu`.

## Commands

- `bun run --cwd packages/motion-gpu perf:core`
- `bun run --cwd packages/motion-gpu perf:core:check`
- `bun run --cwd packages/motion-gpu perf:core:baseline`
- `bun run --cwd packages/motion-gpu perf:runtime`
- `bun run --cwd packages/motion-gpu perf:runtime:check`
- `bun run --cwd packages/motion-gpu perf:runtime:baseline`

Root aliases:

- `bun run perf:motion-gpu:core`
- `bun run perf:motion-gpu:core:check`
- `bun run perf:motion-gpu:core:baseline`
- `bun run perf:motion-gpu`
- `bun run perf:motion-gpu:check`
- `bun run perf:motion-gpu:baseline`

## What It Measures

`perf:core` runs deterministic CPU microbenchmarks for hot paths:

- `resolveMaterial` (cached + uncached paths)
- `packUniformsInto` for a 64 `vec4f` layout
- render graph planning and render target resolution
- scheduler execution (`createFrameRegistry().run(...)` with 64 tasks)

`perf:runtime` runs the dedicated `?scenario=perf` harness in Chromium (WebGPU via SwiftShader):

- scheduler loop rate (`scheduler-count` delta per second)
- actual render invocation rate (`render-count` delta per second)
- `always`, `on-demand` (idle), `manual` (idle)
- `manual` with periodic `advance()` pulses

## Output Files

- Latest runs:
  - `packages/motion-gpu/benchmarks/results/core-latest.json`
  - `packages/motion-gpu/benchmarks/results/runtime-latest.json`
- Baselines:
  - `packages/motion-gpu/benchmarks/core-baseline.json`
  - `packages/motion-gpu/benchmarks/runtime-baseline.json`

`benchmarks/results/*.json` is ignored by git.

## Baseline Workflow

1. Run `bun run perf:motion-gpu:core:baseline` and `bun run perf:motion-gpu:baseline` on the reference environment.
2. Commit updated baseline files.
3. Run `bun run perf:motion-gpu:core:check` and `bun run perf:motion-gpu:check` for regression checks.

## Notes

- Results are environment-sensitive (CPU, browser version, power mode).
- Compare only runs from the same class of environment.
