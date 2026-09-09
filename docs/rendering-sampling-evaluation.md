# Rendering sampling and the 10,000-person city

The target remains 30 FPS with all 10,000 travelers at effective 6× game speed,
including camera movement. Disabling work in a diagnostic does not meet that target.
The fixture is the existing 512 × 512 `/play` city: 242 buildings, 90,556 sprite
trees, 1,404 scenery sprites, plus resident monks and wildlife. No replacement
scene or simplified demo is used.

## Techniques investigated

| Technique | Work it can reduce | Fit and constraints here |
|---|---|---|
| Dynamic resolution | Pixel shading and render-target bandwidth | The benchmark can set the whole WebGL canvas to 100%, 75%, or 50% per axis. CSS controls retain their size. At 50%, the canvas has one quarter of the pixels. It cannot remove route planning or CPU pose preparation. |
| Alternating checkerboard samples | Pixel shading, with reconstruction overhead | Reuses previous-frame samples. Moving NPCs require motion-aware history; panning uncovers pixels that have no valid history. The current renderer has color, depth and object IDs, but no motion-vector buffer or temporal reconstruction. |
| Spatiotemporal blue noise | Samples in stochastic effects | Makes sampling error easier to filter over space and time. It does not itself reconstruct missing sprite pixels or remove simulation work. This renderer currently has no ray-traced lighting to undersample. |
| GPU texture compression | Texture memory and sampling bandwidth | KTX2/Basis can transcode to supported GPU formats. Smaller PNG downloads alone do not provide GPU compression. Sprite alpha, exact recoloring swatches and depth data need separate correctness checks. |
| Mipmaps / anti-aliasing | Minification sampling and visible shimmer | A potential improvement for distant artwork. Atlases need safe borders at every mip level; blindly enabling automatic mips can blend neighboring animation cells. The pixel-art style and selection edges must remain consistent. |
| Shared CPU data | Repeated planning and per-NPC preparation | Directly addresses the current CPU timings. Individuals can share atlas images, rig contacts and route facts while keeping separate destinations, positions and phases. |

Dynamic resolution is useful when GPU work limits the frame. Godot documents
this distinction and the additional cost of spatial/temporal upscalers:
[resolution scaling](https://docs.godotengine.org/en/stable/tutorials/3d/resolution_scaling.html).
The application-specific CPU conclusion above is an inference from our timings,
not a performance claim about Godot.

Guerrilla describes checkerboard reconstruction in the Decima renderer used for
Horizon and Death Stranding:
[Decima lighting and AA](https://www.guerrilla-games.com/read/decima-engine-advances-in-lighting-and-aa).
Intel provides implementation details for alternating samples, depth, motion
vectors, disocclusion and reconstruction. Its published gains depend on shading
cost; its numbers are not measurements of this game:
[checkerboard implementation](https://www.intel.com/content/dam/develop/external/us/en/documents/checkerboard-rendering-for-real-time-upscaling-on-intel-integrated-graphics.pdf).
Simply discarding alternate fragments in this game's current full-size passes
would retain CPU submission and vertex work. That is an inference from the
existing render pipeline; it is not an implemented checkerboard experiment.

NVIDIA's researchers demonstrate spatiotemporal blue noise for dithering,
transparency, ambient occlusion and volumetrics:
[Scalar Spatiotemporal Blue Noise Masks](https://arxiv.org/abs/2112.09629).
AMD's FSR2 requires color, depth and motion vectors for temporal upscaling:
[FSR2 inputs](https://gpuopen.com/fidelityfx-superresolution-2/).
Neither is a drop-in switch for this WebGL sprite renderer. A prototype would
need moving-NPC, overlap, selection, pan and zoom quality checks alongside FPS.

GPU compression and mipmaps address texture costs:
[WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),
[Three KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html).
NVIDIA explains why atlas borders must account for lower mip levels:
[Texture Bombing, filtering considerations](https://developer.nvidia.com/gpugems/gpugems/part-iii-materials/chapter-20-texture-bombing).
Preserving this game's alpha cutoff, reserved palette colors and encoded depth
is an application-specific requirement, not a claim that all those data should
use one lossy format.

## Isolation procedure

Use a benchmark-enabled production build and run only one benchmark browser.
Other Conductor sessions must be idle; builds, tests and other local game
servers must be stopped. Verify that stopped server processes actually exited.
Ordinary desktop applications remain running, so these are local operating-load
measurements, not an absolute hardware ceiling.

```sh
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_COUNT=10000 \
BENCH_ZOOMS=140 BENCH_SPEEDS=6 BENCH_WARMUP_SPEED=1 BENCH_SECONDS=10 \
BENCH_COMPONENT_ISOLATION=1 BENCH_CHECKS_ONLY=1 BENCH_ASSERT_HIDDEN_IDLE=1 \
BENCH_OUTPUT=.context/components node scripts/benchmark-game.mjs
```

Repeat with `BENCH_COUNT=0` to remove travelers completely. Hidden 10,000-person
samples deliberately retain simulation. `BENCH_ISOLATION_CASES` accepts a
comma-separated subset of case labels for targeted repeats. Each case records
actual canvas dimensions, draw submissions, CPU intervals, population, game
time and completed trips. Path drawing, visual path updates and path wear have
separate switches. Route replay is diagnostic: pedestrians repeat a completed
legal route; carts keep their swept route planning. Replay coverage is recorded.
Normal builds always run these systems.

The cases share a running world. Paths and cache warmth change over time;
small FPS differences are not isolated causal gains. Paused and zero-population
samples help separate those effects. GPU timer queries and CPU sampling profiles
must be separate from the ordinary FPS comparison.

## Initial isolated results — target not reached

Measured September 8, 2026 (Edmonton), Apple M5, 10 CPU cores, 16 GiB, ANGLE
Metal, 1440 × 900 CSS pixels, view size 140. All other local game servers were
confirmed stopped and other Conductor sessions remained idle. These values
precede the direct-atlas UV experiment. Source changes were uncommitted on top
of `810cc334`; raw artifacts are local under `.context/components-clean-10k`
and `.context/components-zero`.

| 10,000 travelers, requested 6× | FPS | p95 frame ms | Effective speed |
|---|---:|---:|---:|
| full-running | 9.3 | 133.3 | 5.55× |
| resolution-75-running | 10.1 | 116.7 | 5.90× |
| resolution-50-running | 11.1 | 100.1 | 5.96× |
| paths-drawing-off | 10.7 | 100.1 | 5.84× |
| paths-appearance-updates-off | 9.6 | 133.3 | 5.43× |
| paths-wear-off | 10.9 | 116.6 | 5.79× |
| pedestrians-reuse-completed-routes | 12.8 | 100.0 | 6.05× |
| all-path-work-off | 15.8 | 66.8 | 6.03× |
| characters-hidden-running | 22.0 | 66.7 | 5.77× |
| characters-hidden-path-work-off | 55.3 | 33.3 | 6.01× |
| full-paused | 17.6 | 83.3 | paused |
| resolution-50-paused | 18.8 | 66.7 | paused |
| characters-hidden-paused | 59.9 | 16.7 | paused |
| only-characters-paused | 20.4 | 50.1 | paused |
| all-hidden-paused | 60.0 | 16.7 | paused |
| restored-running | 10.1 | 133.4 | 5.63× |

Every case retained all 10,000 travelers; hidden characters submitted zero
actual draws and performed zero visual-position updates. Replay reached 9,911
cached pedestrian routes in the combined path-work case; carts continued their
normal planner. The frozen/disabled-work cases are diagnostics only.

The initial full-running sample spent mean CPU intervals of 34.3 ms planning
routes, 12.3 ms stepping simulation, 6.3 ms positioning travelers, 30.2 ms in the
animation/wildlife callback interval and 12.2 ms preparing character batches.
The animation interval includes separately reported wildlife and path-update
callbacks. Simulation includes route planning and stepping; do not add those
nested values again. The final restored sample was 10.1 FPS, still below target.

At 50% resolution per axis, planning had already fallen to 15.7 ms while
animation and batching remained around 30.8 and 11.8 ms. The FPS increase cannot
be assigned to pixel reduction alone. Paused full/half-resolution samples
measured 17.6/18.8 FPS. This evidence points to CPU preparation as the stronger
limit; it does not prove that pixel sampling techniques have no value on other
hardware, at other zooms, or after CPU optimization.

With **zero travelers**, the full city at 6× measured 60.0 FPS, p95 16.7 ms.
Half resolution, path drawing disabled, path appearance disabled, pause and
restoration also measured approximately 60 FPS. Disabling path wear measured
59.6 FPS. Ambient systems remained enabled. This zero-traveler run starts with
fresh paths; the 10,000-person hidden-layer run preserves the worn network.

## Follow-up diagnostics

Direct atlas UVs remove ordinary batched walkers' private walking Texture views;
selected/standalone sprites retain private views. The GPU test mixes both forms,
changes UVs and palettes, and compares color and ID pixels with individual
sprites across sizes, directions and frames. It passes. This change did not
meaningfully improve the initial running FPS (9.3 FPS versus 9.3 in the previous
matrix); do not describe it as a measured frame-rate gain.

In the follow-up build, freezing traveler positioning, humanoid poses and batch
updates while keeping their existing draw data produced these diagnostics.
Transport-specific callbacks and ambient systems remain enabled:

| Condition, 10,000 travelers | FPS | Effective speed |
|---|---:|---:|
| Full running | 9.3 | 5.48× |
| Traveler visual updates frozen, simulation running | 21.1 | 5.90× |
| Full paused | 20.6 | paused |
| Traveler visual updates frozen, paused | 59.9 | paused |
| Restored running | 11.2 | 5.85× |

Later samples have older routes. A separate visible
browser-window run measured 9.7 FPS initially, 21.6 paused and 11.1 restored.
The similarity argues against a headless-only explanation on this machine.
Raw runs: `.context/direct-atlas-isolation-10k`, `.context/headed-10k`.

A separate paused CPU profile (`.context/poses-profile-10k`) attributes 2.70 s
of an 8.89 s capture to the general character update function, 0.78 s to batch
writes and 0.61 s to pruning source hierarchies. These are inclusive sampled
costs, not additive frame timings. The corresponding unprofiled interval ran
at 22.1 FPS. Sampling ran after the FPS measurement.

The next experiment adds a bounded library of recently planned worker routes.
The library separates shortcut preferences, gives each NPC its own mutable
waypoints, checks current walls/terrain/shortcut clearance before reuse, and
refreshes wear-based route preferences after 30 simulation seconds. Destinations
remain individually randomized; this differs from the diagnostic replay mode.
It applies to worker departures in the normal simulation scope as well as the
city fixture. Direct/editor callers continue planning fresh routes.

That build measured 10.1 FPS initially, 31.9 with characters hidden and 11.3
when restored. The hidden interval retained effective 5.95× simulation speed;
the visible intervals retained 5.69× and 5.78×. The initial sample recorded 9,159
route reuses and 26,687 plans since startup; later counts are cumulative. Hidden
layers also now skip the shared humanoid callback loop itself. These are short,
sequential diagnostics with different world ages, not an isolated attribution
of every FPS change to route memory. Raw run: `.context/route-memory-10k`.
The 30-FPS/10,000-person/6× target remains unmet.

Sparse typed cost blocks replace boxed numeric Map entries for the nine local
edge directions during shared departure queries. Epochs refresh wear answers
without clearing the map; nonlocal/custom queries retain the general path.
The corresponding short run (`.context/typed-cost-10k`) measured 10.8 FPS
initially and 12.1 after pause/restoration, with effective speed 5.83×/5.99×.
Planning averaged 20.8/13.0 ms respectively. Character animation/wildlife and
batch preparation remained approximately 29/11.5 ms per frame. This still fails
the target. Fine pose timers sample only one in 128 render orders and are
quantized by browser clock precision; they are diagnostic estimates.

## Shared walking loop and destination corridors

Ordinary walking now has a compact update in the shared sprite loop. It uses
the existing authored rig, distance phase, displayed-frame support foot and
ground equations. Work poses, furniture, attachments, selected people and
standalone previews retain the full update. Contact tests cover 1×/2×/3×/6×,
slopes, turns, pauses and detail transitions. Pose state is shared between the
two paths, so changing activity does not restart the walk cycle.

Worker departures can also learn destination trees from previously found A*
routes. Different starts reuse known suffixes; this avoids computing a full
flow field for every destination. Only new cells attach to an existing tree,
preventing cycles. The cache is bounded to 256 destinations and 131,072 cells,
with at most 4,096 cells per destination. Reuse checks current doors, water,
walls and elevation, and a blocked route invalidates that destination tree.
The original 30-simulation-second preference lifetime applies across both
cache layers; copying a learned corridor into a worker's route does not renew
its age. Individual destinations and shortcut preferences remain independent.

Batch entries publish their resolved poses directly. Immutable centers, IDs
and palettes upload only when their batch row changes, while instance indices
are initialized when capacity grows. The GPU comparison includes direct and
private texture views, mutable and immutable entries, and removed/restored
sources changing row order. Publishing poses reduced the reported batch phase,
but moved some work into animation: combined timings do not establish a large
FPS improvement from that change alone.

| Production build, 15-second 10,000-person samples | Close 36 | Wide 140 |
|---|---:|---:|
| Direct pose publication | 16.5 FPS / 5.89× | 11.4 FPS / 5.86× |
| Shared walking loop and destination corridors | 16.3 FPS / 5.87× | 11.8 FPS / 5.71× |

Both runs retained all travelers and passed selection, tree/transport picking,
building cutaways, camera departure/return, deferred detail switching and
restoration. These are sequential world-age-dependent samples, not a controlled
claim that the small FPS difference comes from one change.
Raw runs: `.context/publish-pose-10k`, `.context/crowd-loop-10k`.

The next terrain change removes temporary arrays in cliff tests and postpones
building scans until a shoreline query actually finds adjacent water. The
geometry decisions remain the same. Full verification at this point has
1,454 passing tests and one previously reproduced upstream failure in
`hospitality.test.ts:466` (`9 < 9`); type checking and the production build pass.
The active base v34, population v30 and monk v40/v41 assets also pass their
existing checks. No walking artwork or rig geometry was regenerated.

The terrain-query build's 15-second wide samples measured 11.75 FPS initially
(effective 5.85×), 31.37 with characters hidden (5.99×), 24.08 paused with
characters visible, and 13.59 restored (6.00×). Hidden characters submitted
zero draws and zero position updates; all 10,000 travelers remained simulated.
Initial/restored animation-and-wildlife time was 25.72/25.87 ms, batch writes
8.96/8.90 ms, and route planning 19.01/10.17 ms. World age still differs between
the samples. Raw run: `.context/terrain-queries-10k`; its CPU profile was taken
after the paused FPS sample. The target remains unmet.

Further work is investigating background pose calculation. Web Workers can
run CPU work independently of the UI thread, and transferable buffers can move
packed inputs/results without cloning their contents. This is a candidate,
not an implemented or measured improvement. It would need to preserve contact
timing, account for delayed results, and report actual character update rate
alongside camera FPS. See [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
and [transferable buffers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
