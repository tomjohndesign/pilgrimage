# Largest-map performance evaluation

The benchmark exercises the real `/play` scene on the largest 512 × 512 map.
It covers 1,408, 2,000, 3,840 and 6,000 travelers, playback speeds through 6×,
pointer dragging, wheel zooming and camera rotation. Sprite trees are the
normal renderer and the benchmark default. Procedural trees remain available
only in an explicitly enabled benchmark build for historical comparisons.

## Reproduce

```sh
npm ci
NEXT_PUBLIC_GAME_BENCHMARK=1 npm run build
npm run start -- --port 3101
```

Open the city at
`http://localhost:3101/play?seed=12345&size=512&traffic=240&trees=sprites&benchmark=city`.
Use `traffic=88` for the 1,408-character reproduction. The largest map generates
16 travelers per traffic unit, so benchmark counts must be multiples of 16.
The city flag and debug handle require the benchmark build flag above.

The seed contains 240 fixture buildings plus two generated buildings outside
the city, 140,303 sprite trees, and 1,404 separate scenery sprites. Grass,
groundcover and small flowers are painted into terrain. These counts describe
placed objects, not draw calls or individual triangles. The benchmark records
the complete list of loaded texture images separately; its resource timing
buffer is enlarged to avoid silently truncating that inventory.

The fixture uses real catalogue buildings, streets, terrain, wildlife, character
rigs, A* routes and walking contacts. Residents receive deterministic random
local destinations as they arrive. This stresses continuous city traffic;
it does not claim to model an autonomous city's complete jobs and economy.
The final 1,408-character run loaded 416 texture images at its initial close view;
additional views and activities can load more.

Run each command separately, without builds, unit tests or other GPU tests
running alongside it. Pause other open game tabs for meaningful comparisons.
On macOS, prefix commands with `caffeinate -di` to prevent host sleep.

```sh
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_TERRAIN=sprites BENCH_COUNT=3840 BENCH_ZOOMS=36,70,140 BENCH_OCCLUSION=1 BENCH_SPEEDS=0.5,1,2,3,6 BENCH_PROFILE=0 BENCH_CITY_SMOKE=1 BENCH_OUTPUT=.context/city npm run bench:game
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_TERRAIN=sprites BENCH_COUNT=1408 BENCH_WARMUP=120000 BENCH_SECONDS=25 BENCH_SPEEDS=1,5 BENCH_MOTION_TRACE=1 BENCH_PROFILE=0 BENCH_OUTPUT=.context/city-soak npm run bench:game
BENCH_URL=http://localhost:3101 BENCH_SCENARIO=city BENCH_TERRAIN=sprites BENCH_COUNT=3840 BENCH_SPEEDS=1,5 BENCH_MOTION=1 BENCH_ROTATE=0 BENCH_ZOOM_MOTION=1 BENCH_INPUT=1 BENCH_PROFILE=0 BENCH_OUTPUT=.context/city-motion npm run bench:game
BENCH_URL=http://localhost:3101 BENCH_TERRAIN=sprites BENCH_TARGET=water BENCH_COUNT=3840 BENCH_SPEEDS=1,5 BENCH_ZOOM_MOTION=1 BENCH_INPUT=1 BENCH_PROFILE=0 BENCH_OUTPUT=.context/water npm run bench:game
BENCH_SCENARIO=city BENCH_COUNT=3840 BENCH_SIM_RATE=10 BENCH_WARMUP_TICKS=900 npm run bench:sim
```

Each browser run writes JSON metrics and screenshots to `BENCH_OUTPUT`.
`BENCH_PROFILE_MOTION=1` captures a CPU profile during measurement;
`BENCH_ALLOCATIONS=1` records sampled allocations. Both add overhead. The default
separate eight-second CPU profile is disabled with `BENCH_PROFILE=0`.
`BENCH_GPU=1` requests asynchronous WebGL timer queries when supported. It
instruments draw submission and adds overhead; use separate runs for ordinary
FPS comparisons. Unsupported GPUs report no timing instead of a CPU estimate.
`BENCH_MOTION_TRACE=1` compares simulated and rendered positions for a small
sample of visible characters and writes the raw trace. It reports position
holds separately from browser frame gaps and main-thread long tasks.
`BENCH_SMOKE=1` adds traveler, transport and tree selection checks.
`BENCH_MIN_FPS` and `BENCH_MAX_P95` optionally enforce machine-specific budgets.

The script uses the existing Playwright installation, a production build,
seed 12345, a 1440 × 900 viewport and device scale 1. On macOS it uses full
Chromium with ANGLE Metal and records the actual GPU. Software SwiftShader
results are not representative of playing on the GPU. Startup and initial
asset loading are excluded. Default warm-up is 15 seconds and measurement
is 20 seconds. City tests start at the city centre, view size 36. Wheel tests
make two continuous trips between view sizes 24 and 140.

FPS comes from actual animation-frame intervals. Frame-time p95/p99, intervals
above 18 ms and long tasks expose stutter hidden by averages. The simulation
clock is measured independently; UI speed 1× corresponds to internal rate 2.
Speeds in a sweep share a running world: later rows include older paths and
more activity, so they are not controlled comparisons of speed alone.
For fresh-run speed comparisons, run one speed per browser and set
`BENCH_WARMUP_SPEED=1` to use the same playback rate during warm-up.

The script verifies population retention, movement, reachable city destinations,
completed journeys and camera/batch alignment. Carts receive swept, collision-checked
routes between street junctions; pedestrians continue using building entrances. Missing visible figures are
recorded during camera movement. Selection checks cover roof cutaway and
restoration, character highlights, tree leaf-hole picking and zoom changes.

## Final 1,408-character measurements

The integrated build was measured on Apple M5 / 16 GiB using hardware ANGLE
Metal, 1440 × 900, DPR 1. Each row covers 20 seconds; views/speeds share one
running city after a 15-second 1× warm-up. Builds, unit tests and other automated
GPU tests were not running during the measurements. Desktop/system load still
varies, so these are observations rather than guarantees.

| View size | Speed | FPS | p95 ms | Long tasks |
|---|---:|---:|---:|---:|
| 36 | 1× | 59.7 | 16.8 | 0 |
| 36 | 2× | 59.2 | 16.8 | 0 |
| 36 | 3× | 59.2 | 16.8 | 0 |
| 36 | 6× | 53.4 | 33.4 | 1 |
| 140 | 1× | 43.1 | 33.4 | 1 |
| 140 | 2× | 41.4 | 33.4 | 3 |
| 140 | 3× | 35.9 | 50.0 | 3 |
| 140 | 6× | 30.5 | 50.1 | 19 |

These rows precede only the final picking-filter fix; the rendering and simulation
code is otherwise the final build. The near city reaches approximately 60 FPS
through 3×, and 6× remains available. The fully zoomed-out city still misses
60 FPS. At 1× wide, approximately 23,148 trees are visible alongside the whole
population, with 483 draw calls and 3.90 million submitted triangles. Sampled
simulation positions did not stall; displayed distant body poses can hold for
about 100 ms because of the reduced pose count and planted-foot contract.

Five real wheel transitions passed: detail never changed during the active zoom,
the saved-image fade actually rendered, distant terrain rims/bridge fine parts
were hidden, and close detail returned. The largest measured switch frame was 49.9 ms; frames in the following
500 ms were at most 33.4 ms. These warmed transitions do not establish a cold
shader-compilation bound. Raw intervals are in the local `detail-settle.json`. Character, transport and
tree selection passed. The final building-selection check caught an interaction
with main's new visibility filter; source picking meshes now remain selectable
when rendered by a batch, while hidden ancestor layers still reject clicks.
The rebuilt application then passed building picking, roof cutaway, selection
through zoom and complete roof restoration.

The final maximum-population sweep is intentionally deferred until after merge
at the user's request. Earlier 3,840/6,000-character results below describe prior
checkpoints, not this exact final build. Mobile emulation also passed all five detail transitions, actual presentation
fades and bridge/terrain restoration using the mobile threshold profile. No
final-build maximum population or physical-mobile FPS claim is made.

## Character-stutter investigation

A short 1,408-character city run reached 58.1 FPS, p95 16.8 ms, with no main-thread
long tasks. Simulated positions advanced continuously in the sampled walkers.
The shared planted-foot rig held some displayed poses for up to about 50 ms;
that behavior was distinguishable from the longer periodic stalls.

After a two-minute warm-up, the same population reproduced a repeating stall:
51 long tasks in 25 seconds at 1×, reaching 156 ms. Footpath snapshot work grew
from about 4.6 to 19.3 ms on average, followed by terrain reconciliation and
texture uploads. At 5×, wildlife repeatedly scanned every building for clearance
and multiplied that work across fixed substeps.

Changes addressing those findings:

- Road appearance snapshots build in approximately 1 ms slices. Sampled contacts
  are copied, so simulation continues modifying live wear while a consistent
  visual snapshot finishes. React publishes the result as a transition.
- Road textures retain their GPU allocation across ordinary wear updates and
  grow geometrically when needed. Texture dimensions and segment indexing remain
  aligned in color and edge passes.
- Wildlife clearance uses padded spatial building queries while retaining signed
  distances inside footprints and escape behavior after construction.
- Game buildings share their identical surface material. Terrain-painted floors
  retain their picking geometry without submitting transparent color draws.

Measured checkpoints before the final building-material change:

| Two-minute city, 1,408 travelers | Speed | FPS | p95 ms | Long tasks / 25 s |
|---|---:|---:|---:|---:|
| Before these stutter fixes | 1× | 53.6 | 16.8 | 51 |
| Before these stutter fixes | 5× | 27.5 | 133.3 | 116 |
| Snapshot slices, texture reuse, wildlife queries | 1× | 44.6 | 33.4 | 3 |
| Snapshot slices, texture reuse, wildlife queries | 5× | 37.3 | 50.0 | 9 |

These runs used an Apple M5 with 16 GiB RAM. Host load varied materially: the
one-minute load average was roughly 3–4 in the baseline and 6–8 in the later
run, with other browser activity present. They demonstrate the periodic stall
reduction and identify remaining costs; they do not establish an isolated FPS
speedup. The latest sampled walkers had no simulated-position holds. Wildlife's
5× average fell from 10.8 ms to 1.5 ms. Rendering and routing still need to fit
inside the remaining frame budget; 60 FPS across all city conditions is not
established by these measurements.

## Current walking and distant-view changes

A slow 5× frame could skip a complete foot-support change and end on the same
foot. The old anchor then cancelled the body's next translation, even though
simulation positions advanced. Support transitions now use the unwrapped
stride advance; crossing a support boundary releases the old contact even when
the displayed foot is unchanged. Atlas wrap alone does not release a planted
foot. Authored poses and distance-based gait timing are unchanged.

At the checkpoint after that fix and shared pose queries,
a short 1,408-character
city run (`.context/city-final-1408`) measured:

| Speed | FPS | p95 ms | Long tasks / 20 s | Longest sampled rendered hold |
|---|---:|---:|---:|---:|
| 1× | 59.2 | 16.8 | 0 | 33.4 ms |
| 5× | 53.3 | 33.3 | 4 | 16.7 ms |

The previous short 5× trace contained a 299.9 ms rendered hold. Both traces had
zero simulated-position holds among sampled walkers. This is evidence about the
sampled movement bug, not a claim that every character or longer-running city
is free of stutter. The benchmark samples up to 32 visible travelers.

The additional changes are:

- Building detail uses resident index buffers sharing original vertex data.
  Below 16 display pixels per world unit, interior triangles are omitted and
  cutaways close. Below 9 pixels per unit, fine thatch grain and reed details
  are omitted too. Hysteresis restores these levels above 19 and 11 pixels per
  unit respectively, preventing repeated switches near a boundary.
- Smoke, fire, local point lights, interior inventory, construction progress,
  payment/piety floaters and relic glow stop drawing at distant detail. Hidden
  receipts expire and their sequence advances, so returning close does not
  replay historical payments. Ambient and directional surface lighting remains.
- Completely batched source hierarchies are excluded during rendering. They
  remain available for posing and picking between frames. Visible equipment,
  individually drawn carts and selected sprites prevent pruning that hierarchy.
- Character pose callbacks reuse terrain-corner results within one synchronous
  frame. Different frames/canvases, ordinary query scopes and exceptions
  invalidate reuse; unscoped queries never read stale frame results.

The interactive smoke test passes character/tree picking, transport highlights,
camera departure/return, roof cutaway, selection retention, distant effect
suppression and close-view restoration. Screenshots were inspected at close and
wide views, including the new terrain sprites.

The subsequent building-cell change combines static surfaces and their IDs in
16-tile cells, retaining original source meshes for picking. Selected cutaways
leave the batch. Ordinary walkers avoid transport setup calculations, and open
service counters share one pass over the population's posted workers.

Terrain batches now compact their existing index buffer when every tile hides
a face, retaining the surviving triangle order and all instance attributes.
An exposed wall or diagonal cut conservatively keeps its face group. This
removes the bottom everywhere and reduces fully enclosed batches to two top
triangles. No extra terrain draw calls or per-frame index allocation are added.

The checkpoint after building cells and terrain compaction submits roughly 750 draws and 5.3 million
triangles at maximum zoom-out, compared with about 1,590 draws and 7.3 million
triangles before building cells and terrain index compaction. Submitted work is
measurably lower; that is separate from the FPS comparison below.

A sweep (`.context/city-terrain-compact`) ran amid another browser test
process and substantial system memory pressure (about 12 GB of swap in use):

| View size | Speed | FPS | p95 ms |
|---|---:|---:|---:|
| 36 | 1× | 25.8 | 66.7 |
| 36 | 5× | 12.9 | 116.7 |
| 140 | 1× | 10.5 | 133.3 |
| 140 | 5× | 5.1 | 350.0 |

These are contended stress results, not an isolated improvement or regression
measurement. An earlier 3,840-character checkpoint measured 39.2 / 20.5 FPS at
view size 36 and 13.5 / 7.7 at view size 140 (1× / 5×). None establishes 60 FPS
for the full city overview. Simulation at fast playback, per-character posing,
terrain rendering and allocation/GC remain significant limits.

After the user authorized stopping competing jobs, the other game servers on
ports 3100 and 3197 were stopped. Their automated browser tests had already
exited. The same production build was retested alone among automated browsers
(`.context/city-isolated-retest`). Conductor/WebKit and ordinary desktop apps
remained running; this was not an otherwise idle machine.

| View size | Speed | FPS | p95 ms |
|---|---:|---:|---:|
| 36 | 1× | 39.8 | 33.4 |
| 36 | 5× | 23.5 | 66.6 |
| 140 | 1× | 16.8 | 83.3 |
| 140 | 5× | 13.3 | 99.9 |

The 1,408-character close city retest (`.context/city-1408-retest`) measured
60.0 / 59.8 / 58.4 / 56.2 / 49.0 FPS at 0.5× / 1× / 2× / 3× / 5× respectively.
It recorded no simulated-position holds in sampled moving walkers and passed
the complete selection/city smoke checks. At 5× the longest sampled rendered
hold was 16.8 ms, with seven main-thread long tasks over 20 seconds. These are
checkpoints before the subsequent distant-pose and batch-allocation changes.

An eight-second CPU profile from the wide city (`.context/city-current-cpu`)
confirmed substantial work in CharacterSprite's pose callback, character batch
packing, Three.js traversal/buffer updates, footpath recording and routing.
Measured mean CPU times at 1× were 17.4 ms rendering/submission, 5.2 ms simulation
and 3.5 ms traveler positioning; at 5× they were 16.9, 24.5 and 3.5 ms. These
CPU intervals do not measure GPU execution time. Smaller sprite textures would
not remove these per-character operations.

## Distant walking poses and playback ceiling

Walking phase continues to advance from actual distance every browser frame.
Nearby characters and selected characters display the full authored sequence.
At medium scenery detail, the current 20-pose stride retains 10 poses; at far
detail it retains 8. Both support-transfer frames remain in the subset. Color,
depth, attachments and `walkContact` select the same displayed pose; support
resets still account for whole strides skipped during a slow frame. This is a
distance-based pose subset, not an independent animation FPS clock. Body and
outline transforms continue updating every frame. No new sprite images or
authored rig changes are involved.

Contact results reuse renderer-owned storage, and an unchanged displayed foot
reuses its rig calculation. Character atlas groups retain their arrays and
membership across frames instead of rebuilding UUID strings and collections
for every person. Batch camera transforms calculate only the translation column
that the billboard consumes, retaining the original arithmetic order. Render
visibility scopes reuse storage while preserving nested/failed-render cleanup.
Immutable appearance palettes also retain their packed batch rows, and ordinary
traveler parents prepare their world matrix once before sprite posing. Dynamic
palette callers and nested equipment retain their original update path.

A subsequent pruning correction recognizes click targets whose material is
invisible. Those targets previously prevented ordinary traveler hierarchies from
being pruned. Their matrices still update for picking before render exclusion.
The full city now excludes 3,808 batched source roots during rendering. Some
matrix cost moves into batch preparation, so the shorter render interval alone
must not be counted as the net frame improvement.

Fresh 1,408-character close-city runs used identical 1× warm-up rates and 25-second
measurements (`.context/city-rate-3x`, `-4x`, `-5x`):

| Playback | FPS | p95 ms | Long tasks |
|---|---:|---:|---:|
| 3× | 56.4 | 16.8 | 2 |
| 4× | 50.1 | 33.4 | 3 |
| 5× | 36.3 | 50.1 | 11 |

These comparisons initially motivated a 3× cap. The requested final controls
are 0.5×, 1×, 2×, 3× and 6×; the benchmark also retains 4× and 5×. Normal
playback remains 1×. Displayed multipliers
remain honest: UI 3× uses internal rate 6, three times the normal rate 2.
Characters keep their stable individual starting phases. Increasing playback
never queues all skipped atlas frames for later rendering. Host desktop/browser
activity still varied between the fresh runs, so these are measured comparisons
on this machine rather than a universal performance ceiling.

## Character-overlap occlusion

Frustum culling already skips objects outside the camera. Depth testing hides
covered pixels, but it does not skip a whole character's pose update or batch
entry. General whole-character occlusion culling is not implemented.

`BENCH_OCCLUSION=1` adds a one-shot GPU readback after FPS measurement. It compares
the existing world ID buffer against an additional character-only ID pass.
Only characters with conservative sprite bounds completely inside the viewport
count as fully covered by other characters. Clipped characters and the mounting
margin cannot inflate that count; cart/driver/animal parts sharing an ID count
as one logical character. Readback is never enabled during ordinary gameplay.

In two 1,408-character close-view samples, 281 and 302 character IDs were fully
inside the viewport; none were completely covered by other characters. In two
maximum-wide 3,840-character samples, all 3,840 were inside and 13 were completely
covered, about 0.34%. Another 65–81 were fully hidden by scenery in the world
pass; that checkpoint restored silhouettes through trees at every distance. These samples
show little potential saving from whole-character overlap culling in this city;
they do not rule out larger savings in a tightly packed crowd fixture. Partially
visible people and selected outlines must remain intact.

The retest city overview hid only 8–9 of 3,840 fully in-view IDs behind other
characters, below 0.25%. The current forest-road fixture at normal zoom measured
60.0 / 59.5 FPS at 1× / 5× and zero fully overlapped IDs. At maximum zoom-out,
the 1× sample hid 87 of 2,279 fully in-view IDs (3.8%). It measured 28.1 FPS.
Whole-character overlap culling offers more potential on that crowded road,
but its sampled savings are still small compared with the current frame deficit.

## Distant outlines, masks and zoom settling

At distant detail, ordinary character and tree overlap outlines are disabled.
Trees neither receive nor cast overlap ink, and character/road visibility masks
through trees are disabled. An unselected distant character stage renders only
its real color: it skips the ID scene render, unoccluded color render, world-ID
copy and outline composite. Character selection and the opt-in overlap diagnostic
still prepare the IDs they need. Close views retain the original effects;
selected character and tree highlights remain available at every distance.

The 3,840-character overview now submits about 525 draws and 3.95 million
triangles, down from roughly 750 / 5.3 million before these pass removals.
In a separate GPU-instrumented run (`.context/city-distant-edges-gpu`), mean GPU
draw-span timing was 20.08 ms at 1× and 20.19 ms at 3×, with no disjoint samples.
The earlier instrumented checkpoint measured 22.61 ms. Host and world age varied;
the submitted-work reduction is more directly attributable than the timing delta.
These runs remain over the 16.7 ms GPU budget for 60 FPS, and CPU work is longer:
the 1× means included 15.52 ms posing/wildlife, 8.28 ms character batch preparation,
7.96 ms simulation and 5.98 ms traveler positioning.

Paused GPU isolation measured 19.59 ms with the complete scene and 16.56 ms
with terrain hidden. Hiding hearth lights measured 19.64 ms, consistent with
their already being suppressed at this distance. These are diagnostic tests,
not gameplay performance claims; removing terrain does not establish a usable
60 FPS scene.

The first drag-and-wheel sweep after these changes, with 1,408 characters,
measured 26.5 FPS / 66.7 ms p95 at 1× and 37.4 / 50.0 at 3×. Graphics programs
increased from 42 to 59 and resident textures from 155 to 257 between rows.
It passed all selection and city interaction checks, with no missing visible
figures or sampled simulated-position holds. The retained far poses can hold
the displayed body between poses; the longest sampled hold was 183.4 ms.
That is separate from main-thread frame stalls and is not evidence of continuous
displayed movement at every zoom.

To address threshold hitches, detail selection now holds the resident level
through wheel/key input and camera easing. It commits the final requested level
only after the camera is within a quarter display pixel at the viewport edge
and remains quiet for 180 ms. Reversed gestures replace pending changes rather
than applying intermediate layers. The central level drives buildings, effects,
walking pose detail, scenery geometry and outline/mask passes together.

The browser benchmark records every detail transition and fails if one occurs
while zooming. Selection smoke tests additionally exercise five wheel changes,
verify the final layer set, and save the next 500 ms of frame intervals to
`detail-settle.json`, exposing a delayed hitch separately from the gesture.

The main integration exposed a separate CPU hotspot in transport collision:
every swept cart substep checked every building. Padded spatial building queries
now narrow that work before the unchanged oriented collision test. The 120-actor,
900-tick city regression went from 241 seconds (and one cart spawned against a
building) to about one second after the broad phase and corrected street-based
cart journeys. This is test runtime, not a browser FPS comparison.

## Final detail behavior and main integration

Integrated `origin/main` through `7e339fe` (0.0.126), including building back-edge
outlines, the new grass/water art, diagonal roads and river cliffs, resident job
outfits, cart parking, and character selection without ground glow. Main's visibility controls remain functional; hiding
characters or wildlife leaves their simulation mounted. Procedural trees are
only available in the explicitly enabled benchmark build.

Detail is selected using display pixels per world unit. Desktop reduces detail
15% earlier than the original thresholds; coarse-pointer mobile viewports use
60% earlier thresholds. Hysteresis avoids repeated switches near a boundary:

| Profile | Enter middle | Enter distant | Restore close | Restore middle |
|---|---:|---:|---:|---:|
| Desktop | <18.4 | <10.35 | ≥21.85 | ≥12.65 |
| Mobile | <25.6 | <14.4 | ≥30.4 | ≥17.6 |

Layer changes wait until zoom input and easing have settled, including 180 ms
of quiet time. A 240 ms transition blends one saved world image into the new
world render. Characters remain live and use current depth. New camera movement
cancels the saved image. The transition uses one GPU texture copy and one extra
presentation sample, rather than rendering both complete scenes each frame.
This avoids simultaneous layer switching during the gesture; it does not
eliminate the rendering cost of retaining close detail through a long zoom.

At middle and distant detail, building surfaces use authored flat colors instead
of camera-dependent Lambert shading. Shadow maps were already disabled; the new
change removes the changing dark building faces. Local lights, interiors,
cutaways, smoke, fire, money/admission effects, progress/inventory decorations,
piety glow and relic lighting are omitted where applicable. Path border shading
and terrain rim strips are hidden. Bridges retain their full deck and ramp
silhouette, main piers and piles, while dropping individual planks, railings,
stringers and hanging ties; distant cylindrical posts use three sides.

Ordinary character/tree overlap ink and distant tree masks are disabled.
Selection remains available. Distant character poses use fewer existing atlas
frames with the same distance-driven rig and displayed-frame ground contact.
Speed changes select the current pose directly; skipped poses are never queued.

`BENCH_MOBILE=1` runs the actual game in a 412 × 915 coarse-pointer Chromium
viewport with DPR 1. This verifies mobile detail selection on the desktop GPU;
it is not a physical-phone performance measurement. `BENCH_DETAIL_SMOKE=1`
checks five wheel transitions, actual presentation fading and hidden terrain/
bridge details. Add `BENCH_CHECKS_ONLY=1` to run correctness checks without
collecting a frame-rate sample. `BENCH_SMOKE=1` also includes those checks.

## Terrain sprite comparison

Integrated the grass, water, environmental sprites and diagonal transitions
from commit `0b8cf8e`, retaining the existing spatial terrain renderer. Both
comparison builds used sprite trees. The benchmark explicitly verifies requests
for `/textures/grass-sprites.png` and `/textures/water.png` in the new build.

| 3,840 travelers | Speed | Previous terrain FPS / p95 ms | New terrain FPS / p95 ms |
|---|---:|---:|---:|
| City, stationary | 1× | 15.5 / 100.1 | 19.5 / 100.0 |
| City, stationary | 5× | 5.6 / 383.2 | 8.6 / 266.7 |
| City, drag and wheel zoom | 1× | 4.1 / 766.6 | 14.5 / 149.9 |
| City, drag and wheel zoom | 5× | 5.9 / 283.3 | 8.4 / 250.0 |
| Forest water area, wheel zoom | 1× | 28.6 / 83.3 | 42.6 / 33.4 |
| Forest water area, wheel zoom | 5× | 27.0 / 100.0 | 41.3 / 50.0 |

These comparisons preceded the stutter fixes above and had substantially
different host load. The new art did not show a regression in these runs,
but attributing the measured differences to the sprites alone would be unsound.
The old-water 1× run also recorded 370 missing visible figures during zoom;
these six new-terrain measurements recorded zero missing figures and zero
camera/batch misalignment samples.

## Other optimizations retained

- All travelers remain simulated. Detailed figures are mounted around the camera
  with bounded admission and a cache; hidden figures skip rig posing. Compatible
  sprites share draw calls, atlases, depth and IDs. Selected figures retain their
  existing individual rendering. Atlas views reuse resident GPU images.
- Camera updates precede character batching. Pointer dragging bypasses expensive
  terrain hover ray marches, and wheel input reaches the camera directly.
- Terrain and scenery use spatial blocks, guarded frusta and frozen world
  transforms. Wear-only terrain updates retain unchanged geometry. Fully buried
  tile walls skip vertex lighting and rasterization; cliffs, boundaries and
  diagonal cuts retain their exposed faces.
- Sprite trees use cropped atlas cells, analytic screen-space sampling, guarded
  visibility queries and shared body/ID buffers. Raycasts reject distant trees
  before detailed leaf-hole tests. Distant views disable tree overlap ink.
  The procedural comparison renderer has reduced geometry at wide views;
  ordinary play and tree previews use sprites.
- Synchronous terrain query scopes reuse repeated cliff/shoreline calculations
  without retaining stale results after in-place ground edits between operations.
- Faster playback combines population work into bounded game-time steps. It keeps
  elapsed time within the existing 100 ms background-frame clamp. Local spatial
  queries replace full-population/tree scans, and routing reuses typed search
  storage, validated road curves and local building/obstacle queries.
- Buildings retain authored surfaces merged per building and their cutaway/IDs.
  Close views use at most 16 nearby hearth lights. Distant views omit local
  lights, fire, smoke and interior surfaces, restoring them when zooming in.
- Collinear visual foot contacts merge by lane. Established dirt uses 1/64 wear
  increments, with width error below .002 tiles; emerging grass wear retains its
  threshold and exact compaction. Navigation retains every original contact.

Resolution, shared rigs and uniform pixel scale remain in place. Unneeded
outline and mask passes are skipped at distant detail.
There is no dynamic resolution and no hidden population reduction.

## Validation

The final Vitest suite passes 156 files and 1,382 tests, including the city
routing regression at 6× and cart broad-phase edit invalidation. Type checking
and the benchmark-enabled production build pass. The final picking-filter
regression also passes the focused 20-test selection suite; type checking and
the production build were rerun after that fix. The existing `scripts/test-sprite-depth.mjs` GPU test
passes, including batched/individual character color and IDs, scenery lighting,
cropped/full foliage, leaf-hole picking, atlas upload reuse and mutable road
texture contents/allocation reuse. Building cells match 3,145,728 GPU color/ID
pixel comparisons across three detail levels, four angles and selection removal.
Compacted terrain retains identical color pixels and depth within 1e-6 compared
with the existing shader-masked geometry, including enclosed top-only batches.
The active base v33, population v29 and monk
v38/v39 asset checkers pass (132,960 population body frames, plus 2,216 frames
for each base/monk pack).

Buried terrain-face checks retain exact interior colors and depth within 1e-6.
Shared-edge color ties may differ within 1/64 of a screen pixel of a tile edge;
the measured differences cover less than 0.1% of compared pixels, with no depth
changes. These are checked separately from interior color mismatches.

## Historical forest checkpoint

Before the new terrain integration and city fixture, the optimized sprite-tree
forest contained 143,594 trees. At view size 36, 3,840 travelers measured
59.6, 60.0, 59.5, 58.3 and 57.9 FPS at 0.5×, 1×, 2×, 3× and 5× respectively.
Dragging measured 59.9 / 58.6 FPS at 1× / 5×. Wheel zooming measured 46.0 / 42.4;
a stationary maximum-wide view measured 31.3 / 24.4. With 6,000 travelers,
normal zoom measured 59.9 / 45.6 and maximum-wide view 16.8 / 10.8.

These are historical measurements of the previous terrain, not claims about
the current city or new sprite terrain. Early procedural-tree runs are likewise
historical and must not be presented as sprite-tree performance. Paused tests
with terrain or lights hidden are diagnostic isolation only, not gameplay FPS.
