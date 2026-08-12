# Contributing

## Local setup

Motion GPU uses the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install
pnpm --dir packages/motion-gpu exec playwright install chromium
```

`pnpm install` configures the tracked pre-commit hook for this checkout. The hook runs the same full gate used by pull requests:

```sh
pnpm run ci
```

That command checks the generated changelog, formatting, lint rules, builds, package and application types, unit tests, and all Playwright/WebGPU scenarios for Svelte, React, and Vue.

The hook is a local safety net. GitHub's required `quality` and `e2e` checks remain the authoritative merge gate because local hooks can be bypassed. Pull requests also run dependency review and CodeQL for JavaScript and TypeScript.

## Performance benchmarks

Performance checks are kept separate from the required PR gate. Their baselines depend on the CPU, browser version, and power mode, so compare them on the same class of machine:

```sh
pnpm run perf:motion-gpu:core:check
pnpm run perf:motion-gpu:check
```
