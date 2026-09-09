# Compute shader feasibility

Source review: September 9, 2026, commit
`2b46cebaeb236978d5379bbc0b0dfbac673d1a11` (0.0.152).
The initial architectural review is followed below by two benchmark-only POCs:
compact WebGL character batches and a native WebGPU compute probe. Normal play
still uses the original WebGL batches. No dependencies or release versions changed.

**POC decision: keep both experiments opt-in.** Compact batches reduce the
payload but showed no consistent frame-rate improvement. The native compute
probe works, but this small calculation is overwhelmed by readback/scheduling
cost. These results do not justify a larger WebGPU migration yet; profile the
current normal-gameplay simulation before selecting the next offload target.

The [simulation follow-up](simulation-navigation-profile.md) identified wasted
road-shortcut and tavern route searches. The road-shortcut optimization remains;
the full-tavern early rejection was removed at the user's request, and visitors
now share occupied benches when needed. The controlled shortcut comparison
preserves every tested route. The browser measurements below the follow-up's
historical heading predate seat sharing and do not measure the current behavior.

The best candidate is **ordinary crowd pose preparation**. GPU computation
could remove repeated JavaScript pose and batch work if rendering consumes its
results directly. A native WebGPU compute shader is technically suitable, but
the current WebGL renderer makes it a substantial integration project. First
establish the current normal-gameplay cost, then test compact GPU-driven
character batches within the existing renderer. Consider stateful GPU walking
only after that smaller experiment passes visual checks.

## Evidence and candidate ranking

The [previous investigation](rendering-sampling-evaluation.md) recorded a
10,000-person paused scene at 20.6 FPS and 59.9 FPS with character visual updates
frozen. Separate profiles implicated character updates, batch writes and source
hierarchy pruning. These historical diagnostics used the old routing-stress
fixture and earlier code; freezing poses is not a playable optimization. The
[restart guide](performance-restart-guide.md) explicitly records that a clean
baseline for the final integrated build is still missing.

| Candidate | Current work | Assessment |
|---|---|---|
| Ordinary walking poses and character batches | `updateCrowdWalk` advances distance phase, selects atlas frames, maintains planted contacts, queries ground, and changes scene transforms. `CharacterBatch.write` then computes view anchors and uploads matrices, UVs and ground planes. | Highest priority to measure. Independent people offer parallel work, with outputs consumed by the color and ID shaders. |
| Wildlife deformation | `wildlifeGeometry.write` transforms every changed animal vertex and normal on the CPU, then uploads changed ranges. | Good mathematical fit, but first compare ordinary vertex-shader skinning/transforms; compute is not necessary for every deformation. Earlier zero-traveler scenes reached 60 FPS, so wildlife is not established as the main limit. |
| Visibility and batch compaction | CPU visibility, atlas grouping, sorting, and source pruning remain around pose calculation. | A later GPU-driven rendering candidate. It needs stable identity, conservative bounds and compatible draw submission; moving the pose equations alone will not remove this cost. |
| Routing and simulation | Mutable routes, activities, jobs, reservations, terrain/obstacle queries and shared world state. | Poor first port. A regular shared-destination flow field could be separate future work, but individual A* searches and same-tick reservations are not a direct independent-element kernel. |
| Water, outlines and pixel presentation | Water animation already runs in a fragment shader; outlines and pixel presentation already use GPU passes. | No evidence that rewriting these as compute addresses the observed CPU costs. Measure GPU time before considering it. |

Relevant source:
[walking loop](../lib/game/render/crowd-walk.ts),
[frame dispatch](../components/game/sprite-frames.tsx),
[batch writes and shaders](../lib/game/render/character-batch.ts),
[batch grouping](../components/game/character-batches.tsx),
[wildlife writes](../lib/game/wildlife/batch.ts),
[water](../components/game/water-motion.tsx).

## Three implementation routes

| Route | How results reach rendering | Cost and recommendation |
|---|---|---|
| Compact instance inputs + vertex shader | Existing WebGL vertex shaders derive stateless values from position/size/phase inputs; color and ID shaders share the equations. | Smallest useful experiment. No compute dispatch and no new render target. CPU foot contacts/ground can remain initially. This tests part of the offload opportunity, not the entire walking cost. |
| WebGL texture computation | Fragment shaders update bounded ping-pong state textures; the existing batch shaders sample the result directly. | Practical stateful GPU experiment without changing rendering backends. This is GPGPU via fragment shaders, not a native compute shader. Extra passes and texture traffic may outweigh savings at small visible counts. |
| Native WebGPU compute + rendering | A compute dispatch writes storage buffers that WebGPU drawing consumes. | Best long-term flexibility, but requires porting this app's custom rendering path. Do not treat changing the renderer constructor as an optimization by itself. |

Three's [GPUComputationRenderer documentation](https://threejs.org/docs/pages/GPUComputationRenderer.html)
describes float state textures, ping-pong targets and direct consumption of
results by visualization shaders. It fits per-person state updates without CPU
readback; it does not provide native compute workgroups or arbitrary scatter
writes.

The app uses React Three Fiber's default WebGL renderer in
[PixelCanvas](../components/pixel-canvas.tsx), custom `ShaderMaterial` passes in
that file and [OutlinePass](../components/game/outline-pass.tsx), and
`onBeforeCompile` patches for sprite depth and batching. Three's
[r185 migration guidance](https://raw.githubusercontent.com/mrdoob/three.js/r185/manual/en/webgpurenderer.html)
requires custom GLSL materials and these patches to be ported to node materials
and TSL. Its WebGL fallback does not automatically port our existing shaders or
establish support for every proposed compute kernel.

A separate WebGPU device can compute without taking over the canvas, but there
is no standard shared `GPUBuffer`/WebGL buffer path to these batches. A CPU
readback and WebGL re-upload would introduce synchronization and additional
copies; asynchronous readback also introduces result age. This is an inference
from the separate APIs and the [WebGPU explainer's interoperability and mapping
model](https://gpuweb.github.io/gpuweb/explainer/). Unified memory on a Mac does
not remove those API boundaries. Avoid this split for per-frame crowd poses.

## A bounded experiment

1. Measure the actual `/play` normal city with 10,000 retained people at wide
   zoom, first 1× and then 6×, following the restart guide. Record eligible
   ordinary walkers separately from total and visible people. Stopped people,
   workers and carts can make the eligible fraction much smaller than 10,000.
   Use separate CPU and GPU diagnostic runs. Do not start a broad matrix.
2. If pose/batch CPU work remains substantial, add a benchmark-only compact
   instance path in the existing `CharacterBatch`, keeping CPU contacts and
   ground queries. Replace avoidable full-matrix writes with compact pose
   inputs, and derive only stateless values in shared vertex code. Compare
   upload bytes and combined animation/batch time as well as total frame time.
3. Only if enough cost remains in stateful walking, prototype texture computation
   in the existing `/play` scene. Dispatch once after movement inputs are ready
   and before all color/ID/selection rendering; never advance the simulation
   once per render pass. Preserve existing pixel targets and presentation.
4. Pursue native WebGPU compute only if results justify the material/pass port,
   or a separate product decision already calls for that migration. Check
   adapter availability, actual backend, required limits and device loss; retain
   a working CPU/WebGL path. Availability must be detected on the user's device,
   rather than inferred from a browser name.

A stateful design needs stable per-person slots, independent of the visible
batch's sorted row. Upload position, heading, distance advanced, playback,
clip/rig identity and reset flags. Store phase, support foot and plant anchors;
keep authored contact tables shared by rig. Output the corrected anchor, frame
and ground data for direct shader consumption. Keep simulation, resources and
reservations authoritative on the CPU. CPU culling and click volumes remain
necessary in the first prototype.

Allocate capacity from the supported population with a hard bound and skip
padding/inactive slots. As a sizing example, a 128 × 128 RGBA32F texture holds
16,384 four-float records and occupies 256 KiB; a ping-pong pair is 512 KiB.
Multiple state variables, uploaded inputs and rig/terrain tables add to this.
This is a storage estimate, not a measured transfer or speed result.

## Correctness gates

- **Walking state is not just elapsed time.** Preserve the authored stride,
  distance-driven phase, displayed support frame, multi-support crossings at
  6×, resets, turns, pauses and detail changes from
  [gait.ts](../lib/game/base-person/gait.ts). See [WALKING.md](../assets/WALKING.md).
- **Terrain is not one bilinear height map.**
  [walkingSurface](../lib/game/map/walking-surface.ts) includes triangle grades,
  bridge corners, ramps and sagging rope decks. Keep CPU queries initially;
  porting them later needs equivalent terrain data and live invalidation.
- **GPU precision can change overlap.** `CharacterBatch.write` deliberately
  computes view anchors on the CPU to match standalone sprites' rounding at
  coincident depths. Do not simply move that multiply into a shader and assume
  equivalence. Retain it initially if the compact path fails GPU comparison.
- **Identity and transitions must survive.** Selected characters currently
  return to individual sprites. Plan a CPU/GPU phase/contact handoff, including
  offscreen return and activity changes. A permanent CPU shadow of all pose
  work defeats the intended saving; full-population readback is also unsuitable.
  If a small on-demand transfer is used, test its latency and transition frames.
- **Picking and all passes must agree.** Current person selection uses CPU hit
  volumes, not only an ID texture. Keep those volumes current and conservatively
  enclosing the corrected pose. Preserve palette, alpha, depth, selected outline,
  source visibility and shared pixel size in every existing pass.

## Validation and decision

Extend the existing GPU comparison in
[test-sprite-depth.mjs](../scripts/test-sprite-depth.mjs) for both batch paths;
reuse `crowd-walk.test.ts`, `sprite-transforms.test.ts`, `pixel-characters.test.ts`
and the actual [game benchmark](../scripts/benchmark-game.mjs). No separate demo
app or synthetic particle benchmark is needed. Relevant rendering changes also
require type checking and the repository's shipping checks.

Compare fresh, matched worlds on an idle machine with fixed quality and full
crowd retention. Report mean/p95/p99 frame time, effective game speed, visible
and eligible counts, CPU packing/pose/batch time, uploaded bytes, GPU timing in
a separate run, and character update cadence. Include pointer pan/zoom,
selection, slopes/bridges, transitions and a smaller population to catch GPU
dispatch overhead. Record hardware, browser, commit, assets and world age.

Keep the experiment only if repeated total-frame improvement exceeds run
variation and all visual/behavior checks pass. Faster kernel timing alone is
insufficient. The existing 30 FPS / 10,000 people / effective 6× objective remains
unverified; this review makes no prediction that compute alone will achieve it.

## POC: compact batches and native WebGPU

Implemented on the source revision above, using the existing `/play` harness.
The compact batch switch is gated by `NEXT_PUBLIC_GAME_BENCHMARK=1` and defaults
off. It skips ordinary billboards' world-matrix rebuilding and sends an anchor
and two basis axes to the vertex shader. CPU view-anchor arithmetic, foot
contacts, terrain queries, palettes and the existing render passes remain.
Offset/edited sprites retain general CPU transform preparation.

The recurring dynamic layout changes from 28 to 22 floats per allocated row:
**21.4% less data at equal capacity**. Reported `dynamicBytes` is a layout-based
estimate of full-capacity uploads, excluding initial allocation and palette/ID
changes. Different atlas membership and capacity can change the total independently.
This is a WebGL vertex-shader POC, not native compute.

The separate [native probe](../scripts/probe-character-compute.mjs) executes a
WGSL compute pipeline with 64 invocations per workgroup. It transforms actual
scene character anchors into camera space, one part of `CharacterBatch.write`.
It measures CPU arithmetic, optional GPU timestamps, and packing/upload/dispatch/
readback, with five warmups and twenty recorded samples. It does not feed its
results into the WebGL renderer or move simulation/foot contacts to the GPU.

### Local observations

September 9, 2026; Apple M5, Chromium 153 / ANGLE Metal, 1440 × 900, DPR 1,
512² map, seed 12345, normal `city`, view size 140, requested 6×, adaptive quality
disabled. **Other active applications and agents contended for this machine.**
These short samples are diagnostics, not clean performance claims.

The initial 10,000-traveler run timed out before measurement. Investigation of
the smaller run found a harness bug: founding town residents now supplement
traffic, so waiting for exactly 1,408 people could never succeed with 1,414.
The harness now checks against the full cast exposed by `DebugHandle`, and
retention assertions still include converts and every founding resident.
`BENCH_COUNT` remains the requested traffic, not a promise of the total cast;
the results record both. No 10,000-person FPS result was obtained in this POC.

| Separate running scenes, 15 seconds each | Original | Compact |
|---|---:|---:|
| Retained people | 1,414 | 1,414 |
| FPS | 3.04 | 4.11 |
| p95 frame time | 416.6 ms | 333.3 ms |
| Effective speed | 3.08× | 4.09× |
| Simulation CPU interval | 243.44 ms | 194.59 ms |
| Animation/wildlife CPU interval | 31.17 ms | 16.74 ms |
| Character batch CPU interval | 2.54 ms | 1.24 ms |
| Batched figures at final snapshot | 921 | 912 |

Simulation and animation also became faster, although this POC does not change
their algorithms. World age, membership and operating load differ. Do not
attribute the FPS difference to compact batches. In these runs simulation was
much more expensive than batch preparation, and neither maintained effective 6×.

The final comparison held the same world paused, with 1,414 people retained,
919 batch entries and equal allocated row capacity throughout. Each sample
lasted eight seconds, after two seconds of settling. An initial paused pass
had unequal spare capacity inherited from startup; the harness now recreates
both layouts before sampling and asserts equal capacity and membership.

| Final paused sequence | FPS | p95 frame | Batch CPU | Estimated dynamic bytes/frame |
|---|---:|---:|---:|---:|
| Original 1 | 54.89 | 33.3 ms | 1.446 ms | 198,912 |
| Compact 1 | 51.27 | 33.3 ms | 1.486 ms | 156,288 |
| Compact 2 | 54.64 | 33.3 ms | 1.429 ms | 156,288 |
| Original 2 | 49.52 | 33.4 ms | 1.605 ms | 198,912 |

The 21.4% payload reduction is reproducible at equal capacity. CPU/frame times
overlap and other phases vary along with them: there is no consistent FPS win.
All four samples retained the population, froze simulation time, and recorded
zero missing visible units or camera/batch misalignment. Paused performance
does not establish the running-game target.

Native WebGPU was available without unsafe browser flags: adapter vendor
`apple`, architecture `metal-3`. Two captured scenes contained 873 and 869
eligible character anchors. CPU projection averaged **0.0162 / 0.0161 ms**;
the native upload/compute/readback path averaged **45.41 / 38.60 ms**. Each
upload/readback was approximately 14 KB. Device/pipeline setup took 964 / 135 ms
and is excluded from those recurring timings.

GPU timestamp medians were zero at the available timing precision; their
quantized means (0.046 / 0.010 ms) do not establish a reliable kernel speedup.
The scene continued rendering during the probe. Round-trip times include queue
and browser scheduling delays and exclude the additional WebGL re-upload that
a live bridge would need. This is evidence against this tiny compute/readback
bridge, not a measurement of a renderer that keeps compute results on the GPU.

Native float32 results were not bit-identical to the current CPU arithmetic:
1,167 / 1,191 components differed, with maximum absolute errors of approximately
3.05e-5 / 1.53e-5 camera-space units. This is not proof of a visible defect, since
the native output was not drawn; it reinforces the need for depth comparison
before replacing the CPU view-anchor calculation.

Raw local artifacts: `.context/poc-small-baseline-2`,
`.context/poc-small-compact-1`, `.context/poc-paused-equal-capacity`.
The earlier `.context/poc-paused-pairs` run is superseded by the equal-capacity
comparison above.

### Reproduce and validate

Build and serve as described in the restart guide, with
`NEXT_PUBLIC_GAME_BENCHMARK=1`. Use separate output directories and one browser.
The following settings were used for each running comparison; repeat with
`BENCH_COMPACT_BATCHES=1` for the compact path:

```sh
BENCH_URL=http://localhost:3198 BENCH_SCENARIO=city BENCH_COUNT=1408 \
BENCH_ZOOMS=140 BENCH_SPEEDS=6 BENCH_ADAPTIVE=0 \
BENCH_WARMUP=5000 BENCH_SPEED_WARMUP=5000 BENCH_SECONDS=15 \
BENCH_PROFILE=0 BENCH_WEBGPU=1 BENCH_OUTPUT=.context/poc-original \
node scripts/benchmark-game.mjs
```

`BENCH_WEBGPU=1` writes `webgpu-compute.json` after the ordinary FPS measurement.
Unsupported browsers return a reason rather than silently emulating WebGPU.
`BENCH_CHECKS_ONLY=1 BENCH_BATCH_COMPARE=1 BENCH_SECONDS=8` instead runs an
original/compact/compact/original comparison with the same paused world and
writes `batch-comparison.json`. Those paused FPS values are rendering diagnostics.
For manual inspection in a benchmark build, use
`window.__pilgrimage.setCompactBatches(true)` and restore with `false`.

Type checking, the benchmark production build and 17 existing walking,
transform and pixel-character tests pass. The extended GPU comparison passes
for both batch paths: 1,797,424 compared visible pixels per path, zero color/ID
mismatches, including moving/scaled parents and changing atlas rows/palettes.
The compact path also passes the actual game's selection, camera departure/
return, tree/transport picking and zoom-detail restoration smoke checks.
