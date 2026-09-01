# Packed consumer checks

The files under `fixtures/` are templates for projects outside this monorepo. They intentionally
import `spektral` as a dependency, so they cannot resolve inside the package's main
TypeScript program before a tarball is installed. This is why only the fixture templates are excluded
from the package `tsconfig.json`.

`pnpm run check:consumers` replaces that in-repo check with the real publication contract:

- build and pack Spektral once;
- copy each template to a temporary workspace without the repository's dependency overrides;
- install the tarball using the repository's pinned pnpm version;
- type-check with `skipLibCheck: false` and build core/Vite, React/Vite, Svelte/Vite,
  SvelteKit/Vite, Next and Vue/Vite consumers;
- resolve all ten public export targets, verify CSS execution through emitted bundle artifacts, and
  retain the raw Svelte artifacts;
- verify executable maps embed `src/lib` sources and that Node stack traces navigate through the
  packed maps without publishing `src/lib`; and
- prove that `src` and `dist` internals remain blocked by the package export map.

The published JavaScript maps and Node stack navigation work directly from the tarball, without a
consumer hook. Rebundlers have a different contract: Vite/Rollup and Next/Webpack do not preserve a
`node_modules` input map through the final bundle by default, so these fixtures install a minimal,
explicit map-chain hook. The hook reads the adjacent `.js.map` from the installed `spektral` tarball
and returns that map unchanged to the bundler. It does not create source paths or `sourcesContent`.
The final bundle assertion therefore verifies both the published map and the configured bundler
chain; it is not a claim that rebundled source navigation is zero-config.

Do not add a source alias or workspace link to these templates. That would make the check stop testing
the artifact users actually install. The runner and its unit tests remain covered by the package's
format and lint commands.

## Peer-version profiles

`pnpm run check:consumers:peers` runs the same tarball against two exact, isolated profiles without
changing the repository lockfile or inheriting root overrides:

- `current` pins the stable dependency versions recorded in the runner;
- `minimum` pins React/ReactDOM 19.0.0, Next 15.0.8, Svelte 5.29.0, SvelteKit 2.20.8
  and Vue 3.5.2.

Svelte's lower bound is 5.29.0 because the published raw components use `{@attach ...}`, which Svelte
[introduced in 5.29](https://svelte.dev/docs/svelte/@attach). A direct probe showed that Svelte 5.0.0
rejects `dist/svelte/FragCanvas.svelte`, while 5.29.0 compiles it. The minimum profile uses the
compatible `@sveltejs/vite-plugin-svelte` 4.0.0 and Vite 5.4.21. The runner reads every installed
manifest and rejects substitutions before type-checking and building.

Vue's lower bound is 3.5.2 because the generated public declarations pass the final `TypeEl` generic
to `DefineComponent`. Vue 3.5.0 and 3.5.1 expose only the earlier 19-parameter type, while 3.5.2 is the
first patch with the required parameter. The isolated consumer check confirms the declaration and
runtime bundle against that exact version.

The manual matrix validates the lower and current endpoints, not every minor release between them. It
is intentionally separate from `ci:quality` because it duplicates six isolated installs, checks and
builds. Raising the React, Svelte or Vue peer floors is a package contract change and requires
release/semver review.
