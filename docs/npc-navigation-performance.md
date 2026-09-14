# NPC navigation performance

September 13, 2026. Baseline: workspace commit `b390c792` (0.0.249).
The comparison uses the existing Vitest simulation benchmark and production
Playwright game benchmark. Release metadata is unchanged.

## Scope and findings

This pass applies data-oriented sharing and spatial filtering to the current
simulation. It does not introduce an ECS, flow fields, or a new update scheduler.
NPC update frequency, population, road speed, and gameplay rules are preserved.

The initial Node profile identified party movement and pack-animal positioning
as substantial steady costs. A production browser run also exposed an
11,048.6 ms simulation step. A separate capture during measurement reproduced
long recovery stalls: wagon recovery occupied 34.98 sampled seconds under
36.27 seconds of simulation, including 29.18 seconds in tree clearance checks.
These are inclusive sampled durations; do not add them together.

The retained changes are:

- **Shared collision queries within each search.** Parking and recovery build
  local spatial indexes for trees, people, and parked obstacles. Each candidate
  convoy body queries a conservative neighborhood, then uses the existing
  collision rules. Bounds include trunk sizes, long rotated obstacles, and
  clearance margins. Each synchronous search rebuilds from live data; nothing
  is cached across world edits.
- **Direct stationary-point clearance.** A tree or person tested at a fixed
  point needs its distance to the oriented body, without segment/corner work.
  Moving segments retain their sweep checks.
- **Direct pack-animal route placement.** Zero-wheelbase route placement uses
  the final moving segment instead of reconstructing roughly forty towing
  steps. Stationary endpoints retain the original reconstruction fallback.
- **Shared seat reservations.** The first seat query in a simulation step
  builds an occupancy index. Later visitors reuse it. New reservations are
  added immediately; live owner checks handle releases, replacements, and
  multiple paying visitors sharing a seat. A rest search with no nearby
  building does not build the index.

## Simulation benchmark

Apple M5, 16 GiB RAM, seed 12345, 512 × 512 normal-gameplay city, travel parties,
internal simulation rate 12 (displayed 6×). Each fresh process ran 600 warmup
steps and 180 measured steps at a fixed 1/60-second input frame. Original and
modified production files alternated in order across three rounds. No other
benchmark, build, or test from this workspace overlapped these measurements.

| Population | Original mean, rounds 1/2/3 | Modified mean, rounds 1/2/3 | Median mean reduction |
| --- | --- | --- | --- |
| 3,840 | 21.62 / 16.81 / 17.86 ms | 23.37 / 15.22 / 13.56 ms | 14.7% |
| 10,000 | 51.52 / 60.69 / 45.22 ms | 74.07 / 46.84 / 41.35 ms | 9.1% |

Median p99 step times were 37.13 → 36.21 ms at 3,840 and 99.70 → 91.52 ms at
10,000. The first round regressed at both populations. Unrelated browser and
system processes were active, and these are **contended observations**, not a
stable hardware-wide speedup promise. The later rounds support reduced steady
work, with substantial uncertainty in the size of the gain.

Reproduce either row, changing `BENCH_COUNT` as needed:

```sh
BENCH_SCENARIO=city BENCH_COUNT=3840 BENCH_PARTIES=1 \
BENCH_SIM_RATE=12 BENCH_WARMUP_TICKS=600 npm run bench:sim
```

The existing Node fixture omits the browser's worker-route-memory scope,
founding residents, rendering, and separate scene systems. These numbers are
simulation step times, not FPS, and do not establish the 30 FPS / 10,000 / 6×
target. Raw logs, run order, host load, and summaries are retained in
`.context/sim-comparison`.

## Controlled collision comparison

A temporary diagnostic used the repository's Vitest environment to compare
the original functions from `b390c792` with the new query on identical data:
2,400 convoy poses, 3,000 trees, 30 parked obstacles, and 40 people. Index
construction is included in the modified timings. All 2,400 boolean answers
matched in every round (306 clear, 2,094 blocked).

| Round | Original full checks | Indexed checks |
| --- | ---: | ---: |
| Cold | 1,251.22 ms | 16.43 ms |
| Warm 1 | 1,632.70 ms | 10.55 ms |
| Warm 2 | 1,260.82 ms | 8.10 ms |
| Warm 3 | 1,156.03 ms | 7.27 ms |

Execution order alternated. This dense collision fixture isolates the work
seen in the recovery profile; it is not a complete path search or normal-game
FPS comparison. The same diagnostic also matched 1,200 pack-route positions
and headings against the original across both directions and curved/clamped
routes. Diagnostic sources are retained as `.context/*.ts.txt` so they do not
join the regular test suite; results are in `.context/parking-comparison.json`.

## Benchmark clock correction

The browser harness used a hard-coded 600 seconds per game day, while the
game derives day length from the current walking rig's reference speed. That
overstated effective playback speed. The debug handle now publishes
`simulationDaySeconds`, and the harness uses it for normal and isolation
measurements. New normal results also record start/end world age in days.
This changes reporting only. Historical FPS and step timers are unaffected;
historical effective-speed values need rescaling by the actual day length / 600.

## Production browser observations

Both production builds used the existing browser harness: seed 12345, normal
city, 3,840 requested travelers plus 12 founding residents, 512 × 512 map,
1440 × 900 at DPR 1, zoom 140, sprite trees, requested 6× speed, adaptive
quality off, two ten-second warmups, and a fifteen-second measurement. The
modified build's separate CPU capture ran after its ordinary measurement.

| Metric | Original | Modified |
| --- | ---: | ---: |
| Observed FPS | 2.66 | 12.56 |
| Mean simulation step | 286.95 ms | 27.83 ms |
| p95 simulation step | 53.10 ms | 51.70 ms |
| Largest simulation step | 11,048.60 ms | 623.70 ms |
| p95 frame interval | 199.90 ms | 116.80 ms |
| Actual playback speed, corrected clock | 1.45× | 5.44× |
| Retained population | 3,852 | 3,852 |
| People that moved during the sample | 3,799 | 3,784 |
| Missing visible figures / camera alignment failures | 0 / 0 | 0 / 0 |
| Browser errors | 0 | 0 |

**These are observations, not a controlled app-wide speedup claim.** The
one-minute host load was 10.95 before and 5.46 after. Equal wall-clock warmups
also reach different simulation ages when one build stalls. The original
harness did not record starting world age; the modified measurement ran from
day 0.6769 to 1.1380. The day length was 354.8008 simulation seconds in both
builds, so the old harness's effective speed was corrected by multiplying by
354.8008 / 600. Original raw results are retained unchanged.

The profile after the modified measurement sampled 218.97 ms under recovery
and 2,901.38 ms under simulation. It covered a different world age and duration
from the baseline stall capture, so these totals are not comparable amounts
of simulated work. The controlled collision comparison is the stronger
evidence for the implementation change.

The remaining 624 ms worst step and 12.56 FPS mean **the performance target is
not met**. Further work should profile remaining synchronous searches and
render/animation costs before selecting update scheduling or shared destination
fields. This pass does not establish 30 FPS at 10,000 characters and 6× speed.

Reproduce the modified browser measurement after a benchmark-enabled build:

```sh
NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build
npm run start -- --port 3198
```

Then, in a separate terminal:

```sh
BENCH_URL=http://localhost:3198 BENCH_SCENARIO=city BENCH_COUNT=3840 \
BENCH_ZOOMS=140 BENCH_SPEEDS=6 BENCH_ADAPTIVE=0 BENCH_WARMUP=10000 \
BENCH_SPEED_WARMUP=10000 BENCH_SECONDS=15 BENCH_PROFILE=1 \
BENCH_OUTPUT=.context/browser-after node scripts/benchmark-game.mjs
```

The baseline and modified captures are in `.context/browser-before`,
`.context/browser-baseline-profile`, and `.context/browser-after`. Corrected
summary values are in `.context/browser-comparison.json`. The benchmark-enabled
production build passed. The updated harness requires a build exposing the
current day length; use the baseline's original harness when reproducing an
older build, then correct its effective-speed reporting separately.

## Regression validation

`npx vitest run --maxWorkers=2 --testTimeout=60000` completed with **2,332
passing tests and nine failures**, across 238 files. Every failure reproduced
with the changed production files restored to `b390c792`:

| Existing failing suite | Failures |
| --- | ---: |
| `travel-parties.test.ts` | 4 |
| `horse-standing.test.ts` | 2 |
| `inn.test.ts` | 1 |
| `balance.test.ts` | 1 |
| `map/generate-map.test.ts` | 1 |

The baseline rerun selected the failing test names: nine failed, one passed,
168 skipped. This establishes that those failures predate this pass; it is not
a claim that the complete baseline suite passed.

The focused simulation/navigation run passed 318 tests. After the collision
index change, the five parking/recovery/party suites passed all 101 tests.
These focused totals overlap with the full suite and should not be added.
New regression coverage includes shared-seat release/replacement, spatial
query equivalence, large trunk clearance, live edits between searches, pack
headings, and stationary point collision boundaries. `npm run typecheck` passed.

Logs are in `.context/full-tests.log`, `.context/baseline-failures.log`,
`.context/focused-tests.log`, `.context/parking-tests.log`, and
`.context/typecheck-final.log`.
