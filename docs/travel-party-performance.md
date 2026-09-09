# Travel parties share one path

September 9, 2026. Follows the [navigation profile](simulation-navigation-profile.md).

The first company implementation (PR #187) paced every member individually
against a formation re-rolled each step, and let every stop plan routes per
person without bound. It made the game unplayable at ordinary populations.
This pass keeps the feature and reworks companies so that a group costs less
to simulate than the same people walking alone.

## What was wrong

Measured on the 512 × 512 normal-gameplay city, seed 12345, 1,408 travelers,
in the browser benchmark at close zoom and 1× speed: 2.6 FPS, with one
simulation step of 61.8 seconds. The same population in the Node sim benchmark
ran at about 10 ms per step for 700 steps and then stalled for many minutes.

The stalls were route planning inside group stops, not the walking itself:

- Starting a camp ran an A* search per member per candidate pitch, over up to
  169 pitches, and members across water from the pitch made every search
  explore the whole reachable map.
- A full enclave re-planned shrine approach routes for every waiting member
  every second, for up to two minutes.
- Boarding re-planned seat routes every step while any route failed.

Steady travel added about a third of simulation time on top: each member was
speed-capped every step against a freshly rolled formation, a wagon bisected
its speed against its walkers twice per step, and rosters were rebuilt with
allocations every step.

## The shared-path model

A company now has one road position, its head. Only the head moves, at the
slowest member's pace. Every walker, rider, wagon and pack animal takes its
place from the head by formation offset, so members on the road run none of
the personal walking update: no shortcut scans, seat rests, water trips,
tavern trips, encounters or per-person path wear. Trouble, bridge single-file
and a footprint covering the road are checked once per road tile for the
head. A detour around a footprint is one shared path the column walks in
turn, wagon included. Road wear is charged once per company.

After a stop the head waits while anyone is behind their place and advances
past anyone ahead of it, so people walk back into formation along the road
without any planning. Camps, visits and boarding still walk each person
through the existing off-road systems, but each route is planned once with an
expansion limit, camp pitches come from one cluster, admissions are asked for
a few companions at a time, and stalled attempts retry on a timer. The shrine
planner now checks for a free place before planning any route.

Formations and the company pace are cached and refreshed a few times per game
second; the eased company speed hides the steps. Party transport figures stay
mounted until they are well outside the view instead of remounting at the
culling edge.

## Simulation benchmark

Per-step times over the normal-gameplay city, seed 12345, `dt` 0.1 s, with the
same code for both rows. "Individuals" is the same cast without companies.

| Population | Steps | Mode | Mean | p50 | p95 | Max |
|---|---:|---|---:|---:|---:|---:|
| 3,840 | 600 | Individuals | 48.6 ms | 33.5 ms | 143 ms | 480 ms |
| 3,840 | 600 | Parties | 16.9 ms | 11.8 ms | 38.7 ms | 120 ms |
| 10,000 | 400 | Individuals | 73.4 ms | 49.4 ms | 209 ms | 906 ms |
| 10,000 | 400 | Parties | 44.7 ms | 33.9 ms | 95 ms | 368 ms |

In the grouped profile, shortcut search, seat-rest and water-trip planning
fall from about 25% of simulation time to under 2%. The remaining per-member
cost is the road lane position each person still needs for rendering, and the
shared needs update. A company of twenty plans zero routes while it travels.

The first party implementation, measured the same way at 1,408 travelers,
ran 700 steps in 10.7 s and then took more than 17 minutes for the next 600.

## Browser benchmark

Benchmark-enabled production builds, 1,408 travelers, 1440 × 900 at DPR 1,
Apple M5, hardware ANGLE Metal, 15-second samples after warmup, adaptive
quality off. Seed 12345, normal-gameplay city. "Before parties" is main at
0.0.168; "Shared path" is this branch. Fifteen-second samples in an aging
world are indicative, not a controlled equal-work comparison.

| Build | View | Speed | FPS | p95 frame | Sim step mean / p95 / max |
|---|---:|---:|---:|---:|---:|
| Before parties | 36 | 1× | 34.9 | 33.4 ms | 6.1 / 10.7 / 103 ms |
| Before parties | 36 | 6× | 19.9 | 133.3 ms | 20.6 / 47.7 / 162 ms |
| Before parties | 140 | 1× | 13.2 | 133.4 ms | 17.4 / 38.2 / 886 ms |
| Before parties | 140 | 6× | 17.4 | 133.3 ms | 22.4 / 64.3 / 688 ms |
| First parties (#187) | 36 | 1× | 2.6 | 166.7 ms | 340.6 / 68.9 / 61,808 ms |
| Shared path | 36 | 1× | 53.9 | 33.3 ms | 4.0 / 5.6 / 106 ms |
| Shared path | 36 | 6× | 27.3 | 66.6 ms | 15.0 / 33.8 / 696 ms |
| Shared path | 140 | 1× | 23.3 | 66.8 ms | 8.8 / 27.9 / 44 ms |
| Shared path | 140 | 6× | 14.4 | 166.7 ms | 27.2 / 111.3 / 174 ms |

All samples retained the full population with zero missing visible figures
and zero browser errors. The shared-path build is ahead of the pre-party
build in three of four conditions; the wide 6× sample is within the noise of
these short runs and its world had reached more group stops. The 30 FPS at
10,000 travelers and 6× target from the [restart guide](performance-restart-guide.md)
remains unverified; this pass removes the regression and makes companies
cheaper than individuals, it does not claim that target.

Reproduce the simulation rows with the existing benchmark:

```sh
BENCH_SCENARIO=city BENCH_COUNT=3840 BENCH_PARTIES=1 npm run bench:sim
```

and the browser rows with a benchmark-enabled build and:

```sh
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_COUNT=1408 \
BENCH_ZOOMS=36,140 BENCH_SPEEDS=1,6 BENCH_ADAPTIVE=0 BENCH_WARMUP=15000 \
BENCH_SPEED_WARMUP=8000 BENCH_SECONDS=15 BENCH_PROFILE=0 \
BENCH_OUTPUT=.context/parties node scripts/benchmark-game.mjs
```
