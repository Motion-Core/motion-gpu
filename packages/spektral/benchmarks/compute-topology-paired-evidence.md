# Compute topology resolver paired A/B evidence

This evidence compares the legacy renderer path (public defensive `pass.getResources()` followed by `resolveComputePassResources`) with the renderer-owned static-topology cache. Both arms use the same worker, pass instances, four real external buffers per pass, timing harness, checksum and Node process launcher.

- Runtime: v22.21.1
- Independent fresh processes: 12 per arm (24 total)
- Process order: balanced pairs, alternating within each pair, seeded random starting arm
- Per-process scenario order: independently seeded shuffle
- Seed: 1394060030
- Worker SHA-256: `f3b620c021ee8c1bddf0a204bc86285e0387dc939eab0c4745c73bb24e8a3ba8`
- Raw samples: `benchmarks/results/compute-topology-paired-latest.json`
- 32-pass acceptance: median cached throughput >=2.0x legacy
- 0/4/16 regression contract: regression requires the 95% bootstrap CI upper bound below -10%, an absolute loss above 25,000 frames/s, and a loss larger than 3x the larger arm MAD
- Cached steady-state contract: zero plan, entry, read, write, layout-entry or topology-key allocations after warmup

| Passes | Legacy median Hz | Cached median Hz |   Ratio | Median delta |      95% delta CI | Verdict                   |
| -----: | ---------------: | ---------------: | ------: | -----------: | ----------------: | ------------------------- |
|      0 |       20,625,924 |      163,383,806 |  7.921x |      692.13% |   680.79%–701.86% | no-significant-regression |
|      4 |           80,586 |        1,616,361 | 20.058x |     1905.76% | 1864.13%–2308.19% | no-significant-regression |
|     16 |           20,014 |          549,409 | 27.451x |     2645.08% | 2616.67%–2671.01% | no-significant-regression |
|     32 |            9,987 |          274,937 | 27.530x |     2652.98% | 2606.95%–2679.53% | speedup-confirmed         |

All worker checksums matched. This is a local CPU-side topology-resolution benchmark; it does not claim GPU timing or CI portability.
