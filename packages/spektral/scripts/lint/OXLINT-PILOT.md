# Oxlint pilot

The pilot adds Oxlint 1.78.0 and oxlint-tsgolint 7.0.2001 before the existing ESLint 10 gate. It does not disable any ESLint rule. A green run therefore has the same ESLint coverage as before, plus an earlier native pass over production code.

## Rule ownership

| Check                                | Oxlint                                                        | ESLint                                                         |
| ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Native `correctness` rules           | Runs on `src/lib`; `.svelte` and `.vue` files remain excluded | Still enabled where they were enabled before the pilot         |
| `await-thenable`                     | Error on production TS/TSX                                    | Error on production TS/TSX                                     |
| `no-floating-promises`               | Error on production TS/TSX                                    | Error on production TS/TSX                                     |
| `no-misused-promises`                | Error on production TS/TSX                                    | Error on production TS/TSX                                     |
| React Hooks                          | Not part of this pilot                                        | Required for React source, tests and E2E harnesses             |
| Svelte and Vue templates             | Not part of this pilot                                        | Required through the framework parsers and recommended configs |
| Config and import-boundary sentinels | Not part of this pilot                                        | Required by `lint:config` and `lint:imports`                   |

The duplicated checks are deliberate. `eslint-plugin-oxlint` is not installed because removing overlap would make a failed Oxlint migration harder to detect. The mutation fixture proves that the native `no-debugger` rule and all three type-aware promise rules fail independently. The existing ESLint mutation suite still covers promise safety, React Hooks and Vue templates.

## Timing

Measurements were taken on 2026-08-13 on an Apple Silicon development machine with Node 22.21.1 and pnpm 10.24.0. Each command started a fresh process. The first run is reported as cold; the warm figure is the median of subsequent runs.

| Command                               |   Cold | Warm median |
| ------------------------------------- | -----: | ----------: |
| `pnpm run lint:oxlint`                | 0.65 s |      0.63 s |
| `pnpm exec eslint . --max-warnings 0` | 9.00 s |      6.97 s |

Oxlint is roughly 11 times faster on a warm run, but the pilot is additive. A fully green lint run costs about 0.63 seconds more than ESLint alone. The practical gain is faster feedback when Oxlint catches a problem before ESLint starts.

## Decision

Keep the side-by-side setup for now. The full type-aware Oxlint category found existing diagnostics outside the three promise rules, and framework template coverage still belongs to ESLint. Revisit overlap removal only after those diagnostics have been reviewed, the framework parsers have equivalent mutation coverage, and the residual ESLint list is empty or explicitly accepted.
