# Tree thinning comparison — 2026-09-13

Close and medium views now retain every tree. Halving density requires both
sustained frame pressure (quality 2) and settled far zoom (zoom detail 2).
The existing zoom hysteresis and gesture quiet period apply. Selected trees,
walking trees, offscreen culling and stable picking IDs retain their behavior.

## Evidence and limits

Tested a benchmark-enabled production build based on `d80cc877`, with this
workspace's changes, through the existing `scripts/benchmark-game.mjs` harness.
Configuration: forest scenario, seed 12345, 512² map, foliage atlas v8, 1,408
requested travelers plus 12 founding residents, 1440×900 viewport, DPR 1,
Chromium 153, Apple M5 / ANGLE Metal, 16 GiB RAM. After three seconds of warmup
at 1×, simulation stayed paused for all comparisons. Camera view sizes were
36 and 140. All scene layers stayed visible and other FPS adaptation was off.

Each view used full → half → restored density in the same browser and world.
The first run measured ten seconds per condition without GPU queries:

| View | Visible trees, full / half / restored | FPS, full / half / restored | Mean render CPU ms, full / half / restored |
| --- | --- | --- | --- |
| Close (36) | 1,163 / 596 / 1,163 | 60.0 / 60.0 / 60.0 | 3.19 / 3.38 / 3.17 |
| Far (140) | 13,884 / 6,989 / 13,884 | 60.0 / 60.0 / 59.9 | 2.33 / 2.83 / 3.71 |

Tree draw calls stayed at two per frame close up and approximately one at far
zoom; thinning changes instance counts within existing batches. Screenshots
show visibly sparser close forests. Restoration assertions passed with unchanged
simulation time and population.

These are **contended, refresh-capped diagnostic samples**, not isolated
performance claims. Other browser/agent processes and OS indexing were active.
The unchanged full-density controls themselves drifted in CPU cost. No clear
close-view benefit was established; this does not prove thinning never helps.

A separate five-second-per-condition run enabled GPU timer queries to look
beyond the 60 FPS cap. Mean GPU times were 8.31 / 8.40 / 10.97 ms close up and
12.46 / 11.62 / 12.34 ms far out (full / half / restored). No GPU disjoints
were reported. That run retained 13,472 / 6,792 / 13,472 far-view instances;
the guarded culling cache can retain different margins between fresh runs.
Close-view results were inconclusive; far-view GPU cost was
modestly lower with thinning. Far-view FPS in that run deteriorated from
60.0 to 51.8 to 45.5, including after restoring the same full forest, so those
FPS differences cannot be attributed to tree density alone. Retaining thinning
as a far-view fallback preserves the potential saving where many more trees
are submitted. Moving-camera and low-end-device performance were not measured.

## Reproduce

Build with `NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build`, then serve with
`npm run start -- --port 3107`:

```sh
BENCH_URL=http://localhost:3107 BENCH_SCENARIO=forest BENCH_COUNT=1408 \
BENCH_ZOOMS=36,140 BENCH_SPEEDS=1 BENCH_SECONDS=10 BENCH_WARMUP=3000 \
BENCH_PROFILE=0 BENCH_ADAPTIVE=0 BENCH_COMPONENT_ISOLATION=1 \
BENCH_CHECKS_ONLY=1 \
BENCH_ISOLATION_CASES=full-paused,half-trees-paused,restored-trees-paused \
BENCH_OUTPUT=.context/tree-comparison node scripts/benchmark-game.mjs
```

For the GPU probe, add `BENCH_GPU=1`, use `BENCH_SECONDS=5` and a fresh output
directory. Run on an idle machine for stronger causal evidence. The diagnostic
tree override is honored only in benchmark-enabled builds.

Validation: typecheck and production build passed; 27 focused tests passed
with one worker, covering foliage, selection/restoration, zoom and frame
pressure. Both browser comparisons passed. Local raw results and screenshots:
`.context/tree-comparison-2` and `.context/tree-comparison-gpu`. The harness also
now uses the current visibility switches and finds the foliage mesh even when
walking-tree limbs precede it.
