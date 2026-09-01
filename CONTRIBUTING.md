# Contributing

## Local setup

Spektral uses the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install
pnpm --dir packages/spektral exec playwright install chromium
```

`pnpm install` configures the tracked pre-commit hook for this checkout. The hook runs the full local gate:

```sh
pnpm run ci
```

That command checks the generated changelog, formatting, lint rules, builds, package and application types, unit tests, and all Playwright/WebGPU scenarios for Svelte, React, and Vue.

The hook is a local safety net and can be bypassed. Pull requests use the deterministic `quality` check as the authoritative code-quality gate, together with dependency review and CodeQL for JavaScript and TypeScript.

WebGPU end-to-end tests require a real, compatible graphics environment. Standard GitHub-hosted runners do not provide one reliably, so E2E remains part of the full local pre-commit gate rather than a required GitHub check. Run `pnpm run ci:e2e` explicitly before opening a pull request if the hook was skipped.

## Performance benchmarks

Performance checks are kept separate from the required PR gate. Their baselines depend on the CPU, browser version, and power mode, so compare them on the same class of machine:

```sh
pnpm run perf:spektral:core:check
pnpm run perf:spektral:check
pnpm run perf:spektral:gpu:check
```

The GPU check requires a hardware WebGPU adapter with timestamp queries and a baseline generated on
the same GPU, driver, OS, and Chromium major version. Create it with
`pnpm run perf:spektral:gpu:baseline`. The command rejects SwiftShader and other software adapters.
