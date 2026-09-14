# Character and scene sound design

## Authoring and QA now

Open `/assets/characters?sounds=1`. The existing character drawer has **Sounds**
and **Appearance** modes. A single grouped character picker contains presets,
road callings and settlement jobs. Sound editing no longer sits among body and
clothing sliders. The old `/assets/sounds` route redirects here.

Sounds are organized into:

- **Event preview:** Greeting, Footsteps, Work and Idle, Play/Stop, event enable,
  volume, speed and animation monitoring. Choosing an action also chooses a
  suitable clip in the existing animation toolbar.
- **Clip bank:** the resolved greeting or assigned effects, individual Remove
  controls and Add clip. Voice options match the body's voice. Automatic
  greetings use the calling plus a consistent variation for the selected person.
- **Timing and variation:** cooldown, pitch variation and rig/custom impacts.
- **Mix and zoom:** master, greetings, effects, idle ambience, dialogue ducking,
  zoom falloff, audible range, voice budget and soloing.
- **Sound QA:** distance/pan simulation, output level, source WAV measurements
  and recent played/suppressed events.

Copy/Edit sound JSON stays in the drawer footer. Edits persist automatically
and use the same versioned, validated document in the game. Appearance mode
retains the original rig and design controls. Changing mode stops audition
playback. No parallel panel or stylesheet was introduced.

Every preset now maps explicitly to its calling: Monk→friar, Nun→nun,
Minstrel→minstrel, Beggar→beggar and Traveler→pilgrim. Storybook, Female, Stout
and Lanky use the matching peasant body and distinct neutral responses. The
previous catch-all peasant fallback caused the shared greeting bug. Preset
and body variations have consistent starting lines; actual NPCs use a stable
variation from their identity. This is a finite recorded cast, not one newly
generated voice for every NPC. All nine visible presets have distinct default
recording URLs. Calling-level edits remain shared by members of that calling.

Walking now uses `dirt-floor-step-1/2/3`: individual soft contacts cut from one
six-second natural walking generation. The generation plan is
`assets/recipes/elevenlabs-dirt-floor-v8.json`; the reproducible source ranges,
light filtering and level settings are in
`assets/recipes/elevenlabs-dirt-floor-v8-import.json`. The importer accepts
`sourceId` plus trim bounds so it can extract cues without more generation
calls. Each cue is 0.4 seconds, with short fades. Older stock boot/mail/shoe
banks migrate to these cues without discarding other authored settings.
These are new auditions; level measurements cannot establish listening quality.

Enable Hear animation events and press the existing animation Play button.
Footsteps follow rig foot contacts. Work follows standing-tree contact at
23/24, fallen wood at frame 26/64, and mallet contact at frame 20/24. The work
marker can be overridden. Play selection highlights the atlas silhouette in
the game's colors; clicking the character selects and speaks, clicking it
again or using Deselect clears it. Dragging still rotates/pans without selecting.
Selection feedback works while muted.

**Zoom affects footsteps and idle ambience only.** Greetings and work cues
retain their level while zooming. An orthographic camera has fixed altitude, so the
visible ground span controls gain: `min(1, (12 / max(12, viewSize)) ^ falloff)`.
Default falloff is 2: a span of 12 tiles retains 100%, 24 retains 25%, 120 retains
1%. Ground distance and stereo pan still apply independently. In the editor,
6× magnification is the close reference and 1× retains 1/36 of that gain. Use
the normal stage zoom to audition it. Walking/ambient effects ramp to the new gain over
40 ms; selection dialogue is independent of zoom. Zoom falloff is exported
and older JSON receives the default without losing other settings.

The QA output meter covers effects after compression. Dialogue has per-file
levels and playback gain in the event log. Sample peaks/RMS do not assess
buzzing, performance or historical pronunciation: source approval still needs
listening. Hidden tabs, mute, navigation and Stop cancel pending playback.

## Runtime now

The same profiles resolve traveler selection, settlement jobs and resident
monks. v6 supplies 24 new greetings: 16 body/calling combinations across nine
callings, plus eight across woodcutter, tavern, shepherd and market jobs.

Both ordinary sprites and the crowd batching path trigger short sounds from
actual distance-driven walking phases or action progress. Camera projection
rejects offscreen emitters. Distance from the camera's ground focus produces
smooth quadratic falloff, and projected horizontal position controls stereo
pan. Paused/reset actors generate no catch-up sounds. Idle sounds have staggered
start times and bounded per-actor intervals. The default is 12 concurrent
foley/idle voices; a new event over that limit is dropped and recorded in QA.
A separate dialogue channel interrupts previous selection dialogue and ducks
foley/idle voices. An effects compressor reduces combined transients.

There are no continuous forest, crowd or horse beds attached to this system.
The old ambience recordings remain in the catalog for comparison, and the
short new bird call is available for audition. Birds, horses, surfaces,
buildings and occlusion need their own event mapping before they should become
part of the live mix. Mounted characters do not generate human footsteps.

## Research and recommended next layers

Wwise's Unity demonstration organizes footsteps as random containers per
material beneath a surface switch. FMOD's multi instruments select variations;
its scatterer instruments distribute short sounds in time and space. Those
patterns fit this game better than mixing complete pre-generated road scenes:
[Wwise Unity demo](https://www.audiokinetic.com/en/public-library/2024.1.8_8898/?id=pg_demoscene.html&source=Unity),
[FMOD instrument reference](https://www.fmod.com/docs/2.03/studio/instrument-reference.html).

Web Audio already supplies spatial panning and attenuation in the browser.
The current orthographic camera benefits from screen-relative stereo and a
ground-plane listener, rather than measuring distance from the elevated camera.
This is our design choice, not a historical or middleware requirement:
[MDN spatialization](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics).

| Visible source | Trigger / control | Recommended treatment |
| --- | --- | --- |
| Person | Foot contact + ground tile material | Keep current calling bank; add dirt/grass/stone surface switches and a second quiet gear layer. |
| Worker | Tool impact, task and held tool | Expand to action-specific banks (axe, hammer, cup), with separately editable contact markers. |
| Horse/cart | Actual gait contact and wheel distance | Hooves tied to the horse rig; leather/wood creaks at sparse intervals. No hoof loop for an empty road. |
| Bird | Visible bird population, movement and species | Sparse species calls with a local cooldown and a small bird-only budget. Never one call per bird per frame. |
| Tavern/market | Nearby occupancy and open/closed state | Several short, soft voice fragments from local people; very occasional brief laughter. Fade density with occupancy. |
| Woodland | Visible canopy coverage and weather | A quiet, seam-tested wind/leaves bed crossfaded between nearby biomes; calls remain separate one-shots. |
| Building | Listener/source location across walls | Occlusion filtering and attenuation; interiors get their own subtle reflections. |

Next, prioritize voices by proximity and relevance (selected person, work
impact, nearby walkers, distant idle) instead of dropping the newest voice at
capacity. Add gradual fades when sources leave view and an occupancy-driven
ambient budget. This keeps busy scenes readable while letting small visible
changes affect the mix. FMOD parameters support continuous transitions rather
than boolean scene switches:
[FMOD parameters tutorial](https://www.fmod.com/docs/tutorials/parameters.html).

For this browser project, keep the event/configuration layer independent of
Web Audio nodes. FMOD/Wwise are useful authoring references; this change does
not introduce their engines or deployment dependencies. Start by listening to
one character, then a small group, then a crowded settlement. Approve source
quality in the playground before enabling another environmental layer.

## Voice and coin corrections (v9)

`elevenlabs-voice-fixes-v9.json` regenerates the monk's second line from plain
`Deo gratias.` with Italian language guidance, replacing the IPA take that read
out syllables/letters. Both knight greetings are regenerated from Old English
spelling at 0.95 generation speed. These three files retain the complete API
output (`trimSilence: false`); the knight endings include their natural quiet
tails. Stable clip IDs now resolve to v9 URLs, including explicit saved banks.
The monk response order remains Pax tecum, Deo gratias, Quid vis fili.

Admission payments now play the existing ElevenLabs `coin-purse-1` recording
instead of the old synthesized merchant selection effect. Background music's
YouTube level is 10/100, reduced from 20/100.
