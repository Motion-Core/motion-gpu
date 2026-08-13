# Historical core signal A/B

This note closes the two schema-v2 core regression signals that could not be attributed during the
performance audit. It does not replace or update a baseline.

## Controlled comparison

- Baseline source: `6f2f21b5dd199eec14f0051a7a5a0768bbb83632`
- Audited HEAD source: `a520031cd4c4417f455d7e31dfbcbf3299a21d28`
- Runtime: Node 22.21.1 on Apple M4 Pro
- Independent processes: 20 per source, 40 total
- Order: seeded shuffle across both sources
- Worker hash: `fe24e5b94b77a7b6e9f20a70a29276d820d2e8acb556c1c16ea5e13518b85821`
- Verdict rule: a 15% throughput regression is ruled out only when the lower bound of the two-sided
  95% bootstrap interval for the median change is above -15%

The runner exports both refs with `git archive` and copies one focused worker into both checkouts.
The worker preserves the historical workloads, 400 ms warmup, batch sizes, and 24 within-process
samples. Each timed operation contributes to a validated checksum, so a behavior regression cannot
be reported as a throughput improvement. This avoids a protocol confound: the original full runner
blobs differ between the refs (`c412d5f…` versus `6023ecc…`), and the baseline runner cannot execute
against the newer source due to an unrelated renamed compute-cache export.

| Metric                             | Baseline median | HEAD median | Median change | 95% change interval | Verdict              |
| ---------------------------------- | --------------: | ----------: | ------------: | ------------------: | -------------------- |
| `resolve_material_cached_hz`       |        131.102M |    131.328M |       +0.173% |     -1.467%–+1.897% | regression ruled out |
| `find_dirty_ranges_clean_frame_hz` |          6.179M |      6.162M |       -0.264% |     -0.580%–+0.074% | regression ruled out |

The raw process and within-process samples are written to ignored
`benchmarks/results/core-paired-ab-latest.json`. Run the comparison from the package with:

```sh
tsx scripts/perf/paired-core-benchmark.ts --runs=20 --seed=1296523349
```

## Supporting run and limitations

An earlier supporting 20-process-per-arm run used each ref's original full runner. It also found no
central regression (`-1.465%` cached material and `-0.251%` clean scan), but it is not the final
evidence because the full runner blobs differ. Its effect intervals were `-8.336%–+2.058%` and
`-0.959%–+0.456%`, respectively.

No other audit hook or benchmark ran during the final comparison, but existing development servers
were deliberately left running. Power mode was recorded as `uncontrolled`, so these absolute
throughput values are not a portable baseline. The randomized same-host A/B and narrow relative
intervals are sufficient to reject the historical 15% regression claims for these two cases. No
tracked baseline was reset, and no hosted CI performance gate was added.
