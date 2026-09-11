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

While a company visits, whoever is not at the relic waits in one group on the
grass at the corner where the branch leaves the road, on the side the company
came from. The standing places are listed once per attempt from the corner
outward, each companion takes the nearest free one with a bounded route, and
companions still on the road ask again on a timer. Someone called up from the
grass starts their approach where they stand and walks back to the same place;
once the visit is over everyone walks to the nearest road tile before the
company regroups.

Formations and the company pace are cached and refreshed a few times per game
second; the eased company speed hides the steps. Party transport figures stay
mounted until they are well outside the view instead of remounting at the
culling edge.

## Simulation benchmark

Per-step times over the normal-gameplay city, seed 12345, `dt` 0.1 s, with the
same code for both rows, on a quiet machine. "Individuals" is the same cast
without companies.

| Population | Steps | Mode | Mean | p50 | p95 | Max |
|---|---:|---|---:|---:|---:|---:|
| 3,840 | 600 | Individuals | 13.8 ms | 12.0 ms | 23.2 ms | 45 ms |
| 3,840 | 600 | Parties | 8.3 ms | 7.1 ms | 12.6 ms | 45 ms |
| 10,000 | 400 | Individuals | 34.3 ms | 25.1 ms | 78.2 ms | 212 ms |
| 10,000 | 400 | Parties | 20.7 ms | 18.0 ms | 34.9 ms | 86 ms |

In the grouped profile, shortcut search, seat-rest and water-trip planning
fall from about 25% of simulation time to under 2%. The remaining per-member
cost is the road lane position each person still needs for rendering, and the
shared needs update. A company of twenty plans zero routes while it travels.

The first party implementation, measured the same way at 1,408 travelers,
ran 700 steps in 10.7 s and then took more than 17 minutes for the next 600.
Two later stalls had the same shape and were removed in turn: company camps
(planning up to 169 pitches per member, since replaced by no camping at all)
and wagon parking at the enclave, which checked clearance against every tree
on the map for every route sample instead of the nearby obstacles vendors use.

## Browser benchmark

Benchmark-enabled production builds, 1,408 travelers, 1440 × 900 at DPR 1,
Apple M5, hardware ANGLE Metal, 15-second samples after warmup, adaptive
quality off, 1× speed. Seed 12345, normal-gameplay city. "Before" is main at
0.0.168, before companies existed; "After" is this branch with companies,
shared provisions, no camping, batched passenger carts and shared rein
materials. Both servers ran side by side and each condition alternated between
them, so both sides saw the same background load from other sessions (one-minute
load average 5–12). The numbers are therefore lower than an idle machine would
give, but comparable with each other.

| Condition | View | Before FPS (p95 ms) | After FPS (p95 ms) |
|---|---|---:|---:|
| Static | Close (36) | 37.8 (33.4) | 32.1 (50.0) |
| Static | Wide (140) | 25.8 (66.6) | 23.7 (66.7) |
| Panning | Close (36) | 36.6 (50.0) | 41.0 (33.4) |
| Panning | Wide (140) | 24.2 (66.6) | 26.0 (50.1) |
| Zooming | Close (36) | 13.7 (166.6) | 19.2 (83.4) |
| Zooming | Wide (140) | 30.9 (50.0) | 30.3 (50.0) |

The first party build measured 2.6 FPS static at the close view, with one
61.8-second simulation step. After the shared-path model, companies render at
parity with the pre-party build while drawing 78 wagons, 85 pack animals and
their passengers on top of the same crowd; the static close view is the one
condition still behind, tracking about 150 extra draw calls per frame from
vendor carts and rein instances. Every sample retained the full population with
zero missing visible figures and zero browser errors. The 30 FPS at 10,000
travelers and 6× target from the [restart guide](performance-restart-guide.md)
remains unverified.

Close-zoom profiles attribute the remaining frame to Three.js walking the
scene graph in each of the six render passes (about 13%), the wildlife
skinning at the wide view (now re-skinned every third tick when distant, with
analytic hide normals), and shader-program lookups forced by character
materials that render into a linear-space mask target and then to the sRGB
screen (about 5%, from vendor carts after reins and passenger carts were made
to share materials or batch).

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
