# Uniforms

## Declaration

Uniforms are declared in `material.uniforms`.

Example:

```ts
const uniforms = {
  uTime: 0,
  uMouse: [0, 0],
  uTint: [1, 0.9, 0.8, 1],
  uTransform: { type: 'mat4x4f', value: new Float32Array(16) }
};
```

## Type inference and validation

- `number` -> `f32`
- tuple length 2/3/4 -> `vec2f`/`vec3f`/`vec4f`
- matrix must be explicitly typed (`mat4x4f`)

At runtime, values are validated before upload. Invalid shape or non-finite values throw descriptive errors.

## Layout rules

Uniform layout is generated with WGSL alignment constraints:

- `f32`: align 4, size 4
- `vec2f`: align 8, size 8
- `vec3f`: align 16, size 12
- `vec4f`: align 16, size 16
- `mat4x4f`: align 16, size 64

Final uniform buffer size is rounded up to 16 bytes, minimum 16 bytes.

## Packing

On each render:

1. Uniform map is packed into `Float32Array` using computed offsets.
2. Buffer is uploaded via `device.queue.writeBuffer`.

Missing keys in runtime map are ignored, preserving existing defaults from declaration map merges.

## Runtime updates from `useFrame`

Inside frame callback, call:

- `setUniform(name, value)`

Rules:

- name must exist in declared uniforms
- value must match declared type
- unknown names throw immediately

This protects against silent shader/JS mismatch.
