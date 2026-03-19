# Changelog
All notable changes to Motion Core will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Added structured runtime error metadata: stable `code`, `severity`, and `recoverability` fields in normalized error reports.
- Added runtime context attachment to shader diagnostics for better compile/runtime triage.
- Added an optional runtime error history buffer in the `FragCanvas` runtime flow.
- Normalized `useTexture` hook failures into `MotionGPUErrorReport` payloads.

### Changed
- Added explicit `.js` specifiers in published ESM paths for better cross-runtime compatibility.
- Extracted a shared fullscreen pass pipeline lifecycle used by fullscreen pass implementations.
- Added Context7 links in root/package documentation for AI documentation access.
- Changed default error dialog font weight in `MotionGPUErrorOverlay` from `300` to `400`.

### Fixed
- Guarded the runtime loop against exceptions thrown inside user `onError` handlers.
- Deduplicated repeated runtime error reports to reduce duplicate reporting noise.
- Deduplicated `CurrentWritable#set()` updates to skip redundant reactive notifications.
- Fixed error overlay source label mapping to consistently use mapped source labels.

### Performance
- Improved uniform upload batching by merging nearby dirty ranges before `writeBuffer` calls.
- Added a configurable threshold for dirty-range merge behavior.

### Documentation
- Aligned error-reporting docs with the latest runtime API.

## [0.2.0] - 2026-03-14
### Added
- Added explicit multi-layer entrypoints: root (`@motion-core/motion-gpu`), `advanced`, `svelte`, `svelte/advanced`, `core`, and `core/advanced`.
- Split and standardized API documentation by domain (core, hooks, material, passes, advanced).
- Added named render-target pass graph support for multi-pass pipelines.
- Added advanced scheduler helpers and expanded scheduler diagnostics workflows.
- Added source-mapped shader diagnostics overlay and improved fragment-contract diagnostics.
- Added benchmark baselines and expanded unit/e2e test coverage for runtime paths.

### Changed
- Refactored architecture to separate framework-agnostic core from the Svelte adapter layer.
- Split user context API into dedicated read/write operations.
- Prepared package metadata and publish workflow for public npm distribution.

### Fixed
- Stabilized `FragCanvas` sizing and frame payload synchronization.
- Hardened scheduler dependency validation and init-error recovery behavior.
- Improved texture lifecycle management (blob eviction, allocation reuse, metadata preservation, reload reliability).
- Reduced idle RAF work in `manual` and `on-demand` modes and improved wakeups on context changes.

## [0.1.0] - 2026-02-27
### Added
- Initial MotionGPU release with `FragCanvas` as the primary Svelte runtime entrypoint.
- Material pipeline with immutable `defineMaterial` contracts and runtime material hot-swap support.
- Typed uniform system with runtime layout validation and dirty-range uploads.
- Texture pipeline with WGSL bindings, sampler configuration, mipmap/anisotropy/video support, and `useTexture`.
- Frame scheduler with staged `useFrame` tasks, invalidation control, diagnostics, and profiling hooks.
- Render graph with fullscreen pass primitives and named render targets.
- Error handling pipeline for WebGPU device-loss/uncaptured errors with fullscreen overlay support.
- Shader preprocessing via includes/defines and compile diagnostics mapping.
- Namespaced user-context APIs for plugin-like integrations.
- Core tests and TypeScript hardening across runtime/public API behavior.

[Unreleased]: https://github.com/Motion-Core/motion-gpu/compare/8a3e51e...HEAD
[0.2.0]: https://github.com/Motion-Core/motion-gpu/compare/49e3a57...8a3e51e
[0.1.0]: https://github.com/Motion-Core/motion-gpu/tree/49e3a57
