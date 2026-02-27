# Materials and Shader Contract

## Fragment Function Contract

Your WGSL code must define:

```wgsl
fn frag(uv: vec2f) -> vec4f
```

Fragkit wraps this function in generated shader boilerplate with:

- fullscreen triangle vertex shader
- frame uniforms (`time`, `delta`, `resolution`)
- material uniform struct bindings
- optional texture bindings

## `createMaterial`

`createMaterial` returns a shallow snapshot object:

- clones `uniforms`, `textures`, `defines`
- keeps `fragment` string

Use it when you want a clear material object boundary.

## `resolveMaterial` behavior (internal, but important)

When `FragCanvas` resolves material:

- uniform keys are sorted
- texture keys are sorted
- uniform layout is computed with WGSL alignment rules
- define block is prepended to fragment source
- deterministic signature is created from:
  - final fragment source
  - uniform names + types
  - texture keys

This signature controls renderer rebuilds.

## Defines

Defines are inserted as WGSL constants before fragment code.

- boolean -> `const KEY: bool = true/false;`
- number -> `const KEY: f32 = ...;` (integer literals normalized to `x.0`)
- string -> `const KEY = <raw string>;`

Define keys must be valid identifiers.

## Wrapper details

The generated shader always keeps at least one uniform access alive to avoid optimization edge cases.
It supports these keep-alive patterns:

- scalar: `fragkitUniforms.name`
- vector: `fragkitUniforms.name.x`
- mat4: `fragkitUniforms.name[0].x`

If no uniforms exist, it injects `fragkit_unused: vec4f`.

## Output color transform

When `outputColorSpace` is `'srgb'` but canvas format is not `*-srgb`, wrapper injects linear->sRGB conversion helper.
If conversion is not required, output is passed through directly.
