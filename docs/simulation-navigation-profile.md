# Simulation navigation follow-up

September 9, 2026, following the [compute shader POC](compute-shader-evaluation.md).

The normal city workload is dominated by CPU navigation. This supports a small
CPU optimization before considering a renderer or simulation migration.

## Profile and changes

The production browser capture used seed 12345, a 512 × 512 normal-gameplay city,
1,408 requested travelers plus six founding residents, zoom 140, requested 6×
speed, 1440 × 900 at DPR 1, sprite trees, and adaptive population reduction off.
The original WebGL character batches were active in both captures.

In the baseline CPU sample, `stepSim` accounted for 5.866 seconds of the
9.217-second capture. Its inclusive call stacks contained:

| Work | Sampled time | Share of sampled simulation time |
| --- | ---: | ---: |
| Starting tavern trips | 2.914 s | 49.7% |
| Road-shortcut planning | 1.443 s | 24.6% |
| Starting natural-water trips | 0.424 s | 7.2% |

These are sampled inclusive durations, not independent frame timers. The CPU
capture runs after the ordinary frame measurement. Most people were road
walkers; only six had jobs. This was not the continuous random-routing stress
fixture.

The retained performance change removes unnecessary road checks:

- `findRoadShortcut` first checks whether a chord saves enough distance. Only
  then does it evaluate clearance and wear along the road. Deferred edges are
  summed in their original order, and any blocked edge still rejects the cut.
  A single validated building index serves each synchronous search.

An initial second optimization rejected full taverns before outdoor routing.
That optimization has been removed: the user permits overlapping seated
visitors. `tavernVisitPlan` now prefers reachable free benches, then falls back
to reachable occupied benches. A full tavern can still admit visitors. Markets
still serve without benches.

The road change adds no approximation, retry delay, persistent route cache, or
new GPU code. Seat sharing is a separate requested gameplay change.

## Controlled shortcut comparison

A temporary diagnostic ran through the repository's existing Vitest setup,
comparing the original and modified functions within one process. It used
2,716 queries on the same generated city road, both directions and both
exploration modes, with linearly interpolated road points. All returned routes
matched exactly across four rounds, and again after in-place terrain and
building changes.

| Round | Original | Modified |
| --- | ---: | ---: |
| Cold | 1,243.10 ms | 61.56 ms |
| Warm 1 | 711.54 ms | 19.62 ms |
| Warm 2 | 701.58 ms | 10.73 ms |
| Warm 3 | 845.75 ms | 9.71 ms |

Execution order alternated each round. This measures the shortcut scan only;
it does not reproduce browser spline interpolation, tree obstacles, evolving
wear, or overall simulation cost. It must not be presented as an app-wide
speedup. The diagnostic sources and results are retained under
`.context/navigation-comparison*` and `.context/walking-shortcuts.*.txt`.

## Historical browser observations before seat sharing

These measurements used the now-removed full-tavern rejection alongside the
retained road optimization. They do **not** measure the current seat-sharing
behavior, which has not yet been benchmarked.

Both runs used five-second initial and speed warmups, then a 15-second frame
measurement and an eight-second requested CPU capture.

| Measurement | Original | Modified |
| --- | ---: | ---: |
| Observed FPS | 3.40 | 22.58 |
| Mean simulation step | 238.35 ms | 14.78 ms |
| 95th-percentile simulation step | 302.80 ms | 33.50 ms |
| 95th-percentile frame interval | 416.70 ms | 116.60 ms |
| Mean character batch update | 1.38 ms | 1.13 ms |
| Retained and moved population | 1,414 | 1,414 |
| Missing visible figures / camera alignment failures | 0 / 0 | 0 / 0 |

**These are contended observations, not a controlled app-wide speedup claim.**
The Apple M5 host's one-minute load average fell from 21.72 to 12.53 between
runs. The faster simulation also progressed to a different world state: the
baseline ended with 1,349 walking people, while the modified run ended with
889 walking and 435 seeking. Fixed wall-clock warmups do not align simulation
age. No benchmark browser or build from this workspace overlapped another of
its measurements, but other workspace processes remained active.

The modified CPU capture sampled 2.550 seconds under `stepSim` out of 9.139
seconds total. Road-shortcut planning fell to 0.230 sampled seconds; tavern
planning no longer appeared among the top 35 inclusive game call stacks.
Cart parking remained substantial at 0.625 sampled seconds and is a reasonable
next profiling target. These captures have different simulation throughput and
must not be compared as equal amounts of simulated work.

The controlled shortcut evidence supports retaining the road optimization.
These older browser results do not establish current performance or justify
moving navigation to WebGPU.

Reproduce the browser workload with a benchmark-enabled production build:

```sh
NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build
npm run start -- --port 3198
```

In a separate shell, after the server starts:

```sh
BENCH_URL=http://localhost:3198 BENCH_SCENARIO=city BENCH_COUNT=1408 \
BENCH_ZOOMS=140 BENCH_SPEEDS=6 BENCH_ADAPTIVE=0 \
BENCH_WARMUP=5000 BENCH_SPEED_WARMUP=5000 BENCH_SECONDS=15 \
BENCH_PROFILE=1 BENCH_OUTPUT=.context/sim-navigation \
node scripts/benchmark-game.mjs
```

The captured results, CPU profiles, and source-mapped summaries are in
`.context/sim-baseline-profile` and `.context/sim-optimized-profile`.

## Validation

Before seat sharing, the focused navigation, hospitality, town resident, simulation, settlement
route, and building spatial suites passed 235 of 236 tests. The remaining
existing tavern service test expects 15 gold but receives 17. Running that test
with both production files restored to their original `HEAD` versions produced
the same failure. The optimization does not change prices or that assertion.

New regression coverage checks that straight roads skip spatial work, deferred
road obstructions still reject a cut, moving a building immediately reopens it,
and full taverns admit visitors onto occupied benches while preferring a newly
freed seat. The hospitality simulation also checks five paying visitors sharing
four benches while a penniless passerby remains on the road.
TypeScript checking and the benchmark-enabled production build passed before
the seat-sharing change.

After seat sharing, the four focused tavern navigation, hospitality, town
resident, and walking-shortcut suites passed 130 of 131 tests; only the same
pre-existing payment assertion failed. TypeScript checking passed again.
