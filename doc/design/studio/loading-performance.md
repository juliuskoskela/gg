# Staged revision loading measurement

Measured 2026-11-05 with the versioned `measure-loading.mjs` harness, an isolated copy of `res/test-repo.zip`, 270 added files, 5000 lines in the active file and 200 in each other file. No production repository was touched. Run from the root after building GG:

```sh
GG_TEST_BROWSER=/path/to/chrome node doc/design/studio/measure-loading.mjs
```

Linux, Node 24.21.0, Chromium 155.0.8059.79, 390×844 CSS pixels, Vite development frontend, no CPU throttling. Six alternating-order samples per query include response body transfer on loopback; these are local measurements, not hardware-independent performance promises.

| Query | Response bytes | Median request/body latency |
| --- | ---: | ---: |
| `query_revisions` | 4,886,254 | 208.0 ms |
| `query_revision_summary` | 33,847 | 5.7 ms |
| `query_revision_diff` | 409,860 | 19.3 ms |

The legacy endpoint is the before-contract comparison using the same backend and workload, not a claimed end-to-end baseline build benchmark. Summary plus the active file transfers 443,707 bytes instead of 4,886,254 bytes. The summary does not calculate misleading zero line totals; the preview shows real file count and active diff content as it arrives.

The actual browser made one summary request and one active-file diff request. File navigation mounted 23 of 270 file rows; the document had no horizontal overflow. Initial development navigation to rendered diff took 1051ms. Recorded main-thread long tasks were 201, 71, 94 and 54ms; this is not a 60fps claim. The 846 light-DOM-node count excludes the diff renderer's shadow DOM and must not be used as a total rendering bound.

Acceptance budgets for subsequent regressions on this workload: no inactive-file diff requests, summary response below 50KB, fewer than 40 mounted file rows, and no document overflow. Timing is recorded for comparison, not used as a flaky CI threshold. These budgets were set from this observed contract comparison, not presented as pre-optimization targets. The active diff remains complete to preserve text selection/find semantics; multi-megabyte individual-file rendering remains a performance limitation worth profiling before introducing line virtualization.

Raw local evidence: `.taste-skill/studio/loading.json`. The staged request/stale-response tests are versioned in `e2e/workspace-inspector.test.ts`.
