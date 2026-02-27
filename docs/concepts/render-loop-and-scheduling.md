# Render Loop and Scheduling

Fragkit uses a continuous `requestAnimationFrame` loop in `FragCanvas`, but output rendering is gated by render policy.

## Frame timeline

For each animation frame:

1. Resolve current material and signatures
2. Rebuild renderer if required
3. Build `FrameState`
4. Run scheduled frame tasks (`useFrame`)
5. If `registry.shouldRender()` is true, render GPU frame
6. Call `registry.endFrame()`

## Render mode behavior

`FrameRegistry.shouldRender()` semantics:

- `always` -> always true (unless `autoRender` false)
- `on-demand` -> true only when invalidated
- `manual` -> true only after `advance()`
- `autoRender = false` -> always false regardless of mode

## Invalidating and advancing

- `invalidate()` requests a render in `on-demand`
- `advance()` requests one-step render in `manual`

Both are available from:

- frame callback state
- `useFragkit()` context

## Task graph

`useFrame` tasks can be ordered with `before` and `after` constraints.

- tasks belong to stages
- stages can also have `before`/`after` constraints
- ordering is topological with registration-order fallback on cycles

## Task lifecycle

Each registration returns controls:

- `start()` / `stop()`
- `started` readable store

`started` reflects both explicit start/stop and optional dynamic `running()` gate.

## Auto invalidation

If a task is active and `autoInvalidate` is true (default), running the task marks frame invalidated.
This is especially useful in `on-demand` mode for reactive animation.
