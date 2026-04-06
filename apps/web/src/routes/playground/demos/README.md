# Playground demos

Add a new demo by creating a folder in this directory:

- `demos/<demo-id>/App.svelte` (required)
- `demos/<demo-id>/runtime.svelte` (optional)
- `demos/<demo-id>/<any-file>` (optional; loaded as `src/<any-file>` in the playground sandbox)

Rules:

- `<demo-id>` should be kebab-case (for example `flow-field`).
- The UI label is generated automatically from the folder name (`flow-field` -> `Flow Field`).
- Demos are discovered automatically at build time.

Example:

```
demos/
  flow-field/
    App.svelte
    runtime.svelte
```
