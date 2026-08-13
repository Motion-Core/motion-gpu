# Packed consumer checks

The files under `fixtures/` are templates for projects outside this monorepo. They intentionally
import `@motion-core/motion-gpu` as a dependency, so they cannot resolve inside the package's main
TypeScript program before a tarball is installed. This is why only the fixture templates are excluded
from the package `tsconfig.json`.

`pnpm run check:consumers` replaces that in-repo check with the real publication contract:

- build and pack MotionGPU once;
- copy each template to a temporary workspace without the repository's dependency overrides;
- install the tarball using the repository's pinned pnpm version;
- type-check with `skipLibCheck: false` and build the core, React, Svelte and Vue consumers;
- resolve all ten public export targets and verify the CSS and raw Svelte artifacts; and
- prove that `src` and `dist` internals remain blocked by the package export map.

Do not add a source alias or workspace link to these templates. That would make the check stop testing
the artifact users actually install. The runner and its unit tests remain covered by the package's
format and lint commands.
