# Performance restart guide

Performance work is **paused**, at the user's request to conserve time and tokens.
This is a handoff for a future explicitly requested session, not an instruction
to resume profiling automatically. Last shipped checkpoint: **0.0.150**,
[PR #153](https://github.com/tomjohndesign/pilgrimage/pull/153), merge `9eb124e4`.

## Where we stopped

- The target remains 30 FPS with a population of 10,000 at effective 6× speed,
  including smooth panning, zooming and NPC movement. It has **not been verified**.
- Sprite trees are the normal renderer. Frame pressure can reduce scenery,
  tree density, wildlife, water shimmer and character coloring. Zoom gestures
  defer detail changes, and transitions fade.
- Crowd thinning is **off by default**. Drawing 128 people out of 10,000 was
  explicitly rejected. Offscreen culling is expected; record actual visible
  people separately from total population and any deliberate omissions.
- Shared walking/atlas data, terrain queries, worker-route reuse, hidden-layer
  skips and local roadside encounter/reservation indexes have shipped.
- The original city fixture forced continuous random trips, exaggerated route
  planning/path wear, and bypassed ordinary NPC activities. `city` now preserves
  normal gameplay; `city-stress` explicitly selects the old workload. The normal
  city is not a fully staffed mature settlement. Validate its activity mix before
  using it to represent one.
- No clean full-population FPS result exists for the final integrated build.
  Later tests ran alongside other sessions at the user's request, then were
  stopped. Do not promote those measurements into a clean baseline.

Read [the sampling investigation](rendering-sampling-evaluation.md) for results,
research links and caveats, and [the earlier evaluation](performance-evaluation.md)
for historical work. Old FPS tables, asset versions and scene counts belong to
their recorded commits. Main changed map generation and sprites during this pass.

## Resume with one small comparison

1. Start from current main and record the commit, asset versions, seed, population,
   viewport/DPR, device/GPU, browser, speed, camera and world age. Choose a bounded
   question before running anything; do not launch the entire matrix by default.
2. For performance evidence, use an idle machine and one benchmark browser.
   Finish builds/tests first. If another session is active, postpone the sample or
   explicitly label it contended; do not attribute its FPS changes to code alone.
3. Establish the normal-gameplay city baseline, initially at wide zoom and 1×/6×.
   Verify activity mix, road behavior and retained population before optimizing.
4. If slow, run the smallest relevant isolation comparison below. Profile only
   the dominant phase, make one change, and repeat the same workload/conditions.
   Stop and document the result before starting another experiment.

Use the existing application and harness. In separate terminals, build once and
then serve it; do not rebuild while the benchmark is running:

```sh
npm run typecheck
NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build
npm run start -- --port 3101
```

Basic normal-gameplay comparison, with CPU sampling disabled:

```sh
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_TREES=sprites \
BENCH_COUNT=10000 BENCH_ZOOMS=140 BENCH_SPEEDS=1,6 \
BENCH_WARMUP_SPEED=1 BENCH_SPEED_WARMUP=15000 BENCH_SECONDS=45 \
BENCH_PROFILE=0 BENCH_OUTPUT=.context/perf-restart-baseline \
node scripts/benchmark-game.mjs
```

Manual scene: [normal city](http://localhost:3101/play?seed=12345&size=512&traffic=625&trees=sprites&benchmark=city).
This requires the local benchmark-enabled build. It is not a public production link.
The harness starts fresh browser state; opening another browser tab during the
measurement adds load. Use a new output directory for each run.

The speeds in one command run sequentially in an aging world. For before/after
claims, repeat the same speed, seed, warmup and world-age conditions in fresh
processes. Do not infer causation from adjacent rows in an isolation run.

## Test cases to run selectively

Apply these settings to the baseline command; use separate output directories.
Browser populations on the 512² map must be multiples of 16: 1,408 and 10,000
are valid. These are planned cases, not claims of new passing measurements.

| Case | Settings or procedure | Required observation |
|---|---|---|
| Normal gameplay | `BENCH_SCENARIO=city`; first 10,000, then 1,408 if needed | `city.assigned=0`; normal stops/visits remain; no random trip injection. Record activities, employment, road proximity and path growth. |
| Stationary camera and speeds | `BENCH_SPEEDS=1,2,3,6`, `BENCH_ZOOMS=36,140` | Retain everyone, including monastery converts; record FPS, p95/p99, effective speed and visible count. Run the broad sweep only after the initial comparison. |
| Pan and zoom | `BENCH_MOTION=1 BENCH_INPUT=1 BENCH_ZOOM_MOTION=1 BENCH_ROTATE=0` | No missing visible figures, camera/batch lag or detail switches during zoom. Inspect the settling period and fade too. |
| NPC stutter | Separate diagnostic with `BENCH_MOTION_TRACE=1` | Inspect simulated and rendered holds for moving actors, plus displayed walk frames. Smooth camera FPS alone is insufficient. The trace adds work. |
| Empty scene population | `BENCH_COUNT=0` | Establish terrain/buildings/trees/wildlife cost with genuinely zero travelers. Distinguish fresh paths from an aged populated world. |
| Hidden versus visible | Component cases `full-running,characters-hidden-running,full-paused,characters-hidden-paused,restored-running` | Hidden characters have zero draw submissions and visual-position work, while simulation remains. Restoring visibility restores figures/selection. |
| Path cost isolation | Component cases `paths-drawing-off,paths-appearance-updates-off,paths-wear-off` plus full/restored | Separate path rendering, rebuilding and simulation wear. These switches disable behavior for diagnosis only. |
| Visual CPU versus GPU | Component cases `character-visuals-frozen-paused,only-characters-paused,resolution-50-paused` plus `full-paused` | Distinguish sprite preparation from pixel cost. Frozen actors and reduced resolution are diagnostic results. |
| Routing stress | `BENCH_SCENARIO=city-stress` | Thousands of continuous legal journeys; keep its results separate from normal gameplay. |
| Restoration/selection | `BENCH_CHECKS_ONLY=1 BENCH_SMOKE=1 BENCH_CITY_SMOKE=1` | Picking, building cutaways, camera return, settled detail and full restoration. Use `BENCH_ADAPTIVE_SMOKE=1` separately only when sustained pressure actually reaches quality level 2. |
| Mobile | `BENCH_MOBILE=1`, followed by a physical-device check when available | Earlier detail reduction, gesture continuity and selection. Desktop touch emulation is not mobile hardware FPS evidence. |

Example targeted isolation through the actual World settings controls:

```sh
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_COUNT=10000 \
BENCH_ZOOMS=140 BENCH_SPEEDS=6 BENCH_SECONDS=15 BENCH_PROFILE=0 \
BENCH_COMPONENT_ISOLATION=1 BENCH_CHECKS_ONLY=1 BENCH_ASSERT_HIDDEN_IDLE=1 \
BENCH_ISOLATION_CASES=full-running,characters-hidden-running,full-paused,restored-running \
BENCH_OUTPUT=.context/perf-restart-isolation node scripts/benchmark-game.mjs
```

Component isolation disables FPS adaptation unless the `adaptive-running` case
is selected. Diagnostic route replay applies to `city-stress`; in normal `city`
it does not replace ordinary gameplay routing. Consequently the case named
`all-path-work-off` does **not** eliminate every normal-gameplay pathfinding call.

For a separate CPU profile use `BENCH_PROFILE=1`: sampling happens after each
FPS interval. `BENCH_GPU=1` adds GPU timer instrumentation; do not use that run
as the ordinary FPS comparison. Keep the matching build/source maps while
analyzing profiles. `BENCH_MIN_FPS=30` can enforce the mean target, but does not
verify effective speed, NPC smoothness or population by itself.

## Existing automated regression coverage

These tests already exist; do not duplicate them to restart the investigation.
Unit tests assert behavior, not a hardware-independent FPS promise.

| Coverage | Existing test/source |
|---|---|
| Normal city does not replace activities/routes; road lanes at a 6× step; stress routes respect buildings | [city-benchmark.test.ts](../lib/game/city-benchmark.test.ts) |
| A thousand potential donors reserve distinct spots; begging recovery | [sim.test.ts](../lib/game/sim.test.ts) |
| Same-tick alms reservations, replacement/release and owner exclusion | [roadside-reservations.test.ts](../lib/game/roadside-reservations.test.ts), [spatial-points.test.ts](../lib/game/spatial-points.test.ts) |
| Authored planted-foot walking at 1×/2×/3×/6×, turns, slopes, pauses and detail transitions | [crowd-walk.test.ts](../lib/game/render/crowd-walk.test.ts), [WALKING.md](../assets/WALKING.md) |
| Hidden render passes, source pruning and current picking transforms | [pixel-characters.test.ts](../lib/game/render/pixel-characters.test.ts) |
| FPS adaptation/recovery, background handling and deferred zoom detail | [frame-quality.test.ts](../lib/game/render/frame-quality.test.ts), [scenery-detail.test.ts](../lib/game/render/scenery-detail.test.ts) |
| Tree culling, stable thinning, selected-tree IDs and restoration | [instances.test.ts](../lib/game/trees/foliage/instances.test.ts) |
| Shared routes with private waypoints, live obstacle checks, cache age and acyclic destination trees | [worker-route-memory.test.ts](../lib/game/worker-route-memory.test.ts), [settlement-route.test.ts](../lib/game/settlement-route.test.ts) |
| Terrain/footprint query equivalence and live changes | [walking-ground.test.ts](../lib/game/walking-ground.test.ts), [walking-route-queries.test.ts](../lib/game/walking-route-queries.test.ts) |
| Playback time and bounded background-frame clamp | [simulation-store.test.ts](../lib/game/simulation-store.test.ts) |
| Real GPU color, alpha, depth, IDs, batching and outlines | [test-sprite-depth.mjs](../scripts/test-sprite-depth.mjs) |
| Interactive isolation, pan/zoom, selection and population checks | [benchmark-game.mjs](../scripts/benchmark-game.mjs) |

For a future code change, run only relevant tests first; broader validation when
shipping is `npx vitest run --maxWorkers=2 --testTimeout=60000`,
`npm run typecheck`, and `node --test scripts/test-sprite-depth.mjs` when rendering
changes. The build skips TypeScript errors, so it is not a substitute for type
checking. Last-shipped validation and two reproduced upstream failures are
recorded in the sampling investigation; recheck their status on future main.

The existing [simulation microbenchmark](../lib/game/sim.bench.ts) is available
via `BENCH_SCENARIO=city BENCH_COUNT=10000 BENCH_SIM_RATE=12 npm run bench:sim`.
Its rate is internal: 2 means displayed 1× and 12 means displayed 6×. It is not
equivalent to the complete browser frame: it does not use the browser's same
worker-route-memory scope or sprite-tree placement setup and omits rendering
and separate scene systems. Review parity before using it to justify offloading.

## Server computation: not investigated yet

No server simulation prototype, remote pathfinding test, network/bandwidth
measurement or hosting-cost evaluation was performed. A **browser Web Worker**
pose prototype was explored and parked unvalidated; it still uses the player's
device. It is not server computation and is not included in application source.
Also, “worker routes” in the shipped code means NPC job routes, not Web Workers.

The following are architectural questions for a later session, not measured
improvements or authorization to implement them now:

| Option | Potential work moved | Work/cost that remains |
|---|---|---|
| Browser worker | Simulation or pose calculations off the UI thread | Same device CPU budget; snapshot/buffer transfers, stale results and synchronization. |
| Server simulation/pathfinding | NPC decisions, routes and world updates off the device | Client drawing/pose preparation plus network delay, state delivery, interpolation, reconnect handling and server operation. |
| Server rendering/streaming | Simulation and drawing off the device | A different product architecture: video transport/decoding, input latency, image quality and hosting cost. Not evaluated. |

Moving simulation alone cannot remove the local sprite/batch/render costs
identified in the existing client pipeline. Before choosing an architecture,
measure normal-gameplay simulation separately from visible paused rendering.
If a future offload experiment is justified, compare the same NPC behavior and
effective speed; include bytes transferred, update age, actual NPC cadence,
camera response and recovery from delayed/missing state. Server results would
also need connection conditions and ongoing cost per active game. There is no
measured server-versus-client conclusion to reuse today.

## What to preserve after the next session

Record commit/build, configuration, world age, FPS/frame percentiles, effective
speed, population/visible count, activities/path growth, CPU phase timings,
browser errors and selection/contact checks. `routePlanning` times the fixture's
trip injector; ordinary pathfinding is inside `simulationStep`. Do not sum nested
timers as if they were independent. Empty motion samples mean tracing was off,
not that stutter was absent. Periodic figure checks can miss a single-frame defect.

Raw profiles/screenshots live in gitignored `.context`; they and the parked
prototype may not exist in a future workspace. This guide, linked tests and
committed result summaries are the portable handoff. Preserve a concise result
and its limitations in the repository; keep heavy artifacts separately if needed.
