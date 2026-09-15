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

**Zoom affects footsteps, scene ambience and minstrel performances.** Greetings
and other work cues retain their level while zooming. An orthographic camera has fixed altitude, so the
visible ground span controls gain: `min(1, (reference / max(reference, viewSize)) ^ falloff)`.
The reference is 24 tiles for named scene layers and minstrels, 12 for footsteps,
animal calls and carts. Default falloff is 2: at 120 tiles, ambience retains 4%
and footsteps retain 1%. Ground distance and stereo pan still apply independently. In the editor,
6× magnification is fully close; 1× retains 1/9 of the scene-ambience gain
and 1/36 of the footstep gain. Use
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

Water and canopy wind use local continuous beds. NPC murmurs, reactions and animal calls are individual one-shots (see v10–v14 below).
The old ambience recordings remain in the catalog for comparison, and the
short new bird call is available for audition. Animal calls and cart wheels now follow their visible sources (see v10 below). Surface-specific contacts, building interiors and occlusion remain future layers. Mounted characters do not generate human footsteps.

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

Selection, conversation and minstrel music now take priority over footsteps at
capacity. Other work and environment sources could also benefit from ranking
by proximity and relevance. Add gradual fades when sources leave view and an occupancy-driven
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

## Conversation, animals and wheels (v10)

The shared Sounds controls now work in the animal playground and on the cart
asset. Choose **NPC conversation** in **Sound source** in either editor to
mix the crowd layer. Selection, occasional calls, wheels and conversation each
have their own clip bank, volume, speed, cooldown and range; the existing mixer,
solo, QA log and JSON settings cover them all. Older saved documents gain the
new profiles without losing edits to character sounds.

`assets/recipes/elevenlabs-scene-v10.json` contains 17 new SFX generations,
totalling 57 requested seconds: a selection/call recording for each of the
12 animal species, three five-second conversational fragments, and two
three-second wooden wheel/axle takes. Rabbit feedback is a delicate snuffle,
not a loud vocal call. Original provider output remains in the gitignored
`.context/elevenlabs-scene-v10`; the importer creates versioned mono WAVs.
These are auditions: clean-background prompts and conservative gain limits
do not replace listening for source quality.

Visible living animals call only while moving (including bird flight), with
an initial stagger of 8–20 seconds and subsequent gaps of 18–45 seconds by
default. Spacing uses wall time so fast simulation does not create rapid calls.
Selecting wildlife or a transport animal also plays its species sound at a
constant volume, independent of zoom. Transport animals retain their existing
owner/party selection and highlight behavior. Hidden, concealed and slaughtered
animals do not contribute ambient calls.

Crowd audio requires at least two visible people within six tiles of each other.
Density grows gradually with the nearby group size, both in volume and timing;
a lone traveler does not produce a crowd. Up to two fragments overlap, with
screen-relative pan and distance falloff. The scheduler expires unseen sources
and clears on pause, navigation and hidden tabs. Source tracking is bounded and
updated at most every 150 ms per visible figure. Animal calls have a separate
per-species overlap cap, within the existing overall voice budget.

Moving carts trigger short wheel/axle recordings; parking stops their sound.
Cart motion, crowd murmur and spontaneous animal calls use the existing zoom
falloff. Animal selection takes priority over background effects when the voice
budget is full. The new layers duck under character dialogue and preserve
footstep timing; no human footsteps are assigned to animals.

## Environmental mix and single ox call (v11)

The **Background mix** control defaults to **130%** and multiplies all
non-selection sound gains, including footsteps and work. Older JSON receives
this value; saved individual levels remain intact. Selection voices/calls keep
their existing volume. Small groups now leave shorter gaps between conversation
fragments. A separate crowd-accent bank adds occasional 1.3–1.5-second muted
chuckles, replies and distant calls, with its own cooldown and volume.

The stable ox clip ID now resolves to a new 1.60-second v11 recording requested
as exactly one continuous natural moo. It never loops, and selection suppresses
spontaneous calls of the same species for at least the call cooldown, preventing
an immediate second moo. Other animal calls remain one-shots.

`elevenlabs-scene-v11.json` adds two woodland bird recordings, flowing water,
pond-edge ripples, wind through leaves, two short lyre phrases and three crowd
accents, plus the ox replacement (11 calls, 51.8 requested seconds). Water and
leaves use seam-blended loops; birds, instruments, animal calls and human accents
do not loop. Minstrel work uses the phrase bank with a five-second minimum gap,
and its music follows camera zoom. Default old lyre-pluck settings migrate;
custom banks and levels are retained.

A spatial field samples nearby visible water and standing trees four times per
second. Flowing rivers and water under bridges choose the stream bed; lakes and
ponds choose soft lapping. Water fades out beyond 18 tiles or when no longer
visible. Leaf wind scales with nearby canopy and excludes felled/dead trees;
ambient woodland calls use the same canopy context. Perched as well as flying
birds now call, with shorter staggered intervals. Environmental beds fade when
leaving their source, and stop on pause, mute or navigation. All these layers
share zoom falloff, dialogue ducking and the existing sound QA/mixing controls.

Choose a named layer under **Sound source** in the existing character or animal
Sounds drawer to audition and edit it; water and wind previews loop until Stop.
These recordings still need listening approval in context: measured gain and
clean-background prompts cannot establish naturalness or eliminate all noise.

## Road audibility, waterfall, wind and offering box (v12)

Live Web Audio measurements found road conversation around −75 dBFS at a
24-tile camera span. The crowd and lyre recordings are reimported from the
existing provider outputs at roughly −23 to −25.5 dBFS, with peaks capped at
−6 dBFS. The two `*-v12-import.json` recipes make this reproducible without
new API calls. Stable clip IDs preserve saved banks while URLs change to v12.

Conversation stays anchored to the nearest visible group and its pan/distance
update during playback. Small groups retain more of the bed's level. Conversation
and minstrel work can replace a footstep at the voice limit; they cannot displace
selection. Minstrel performances start a phrase on entry and repeat at the work
cooldown using wall time, independent of animation speed or appearance. Walking
away or hiding the performer stops its music. The editor's zoom readout reflects
the revised 24-tile ambience reference; zoom and range still attenuate it.

`elevenlabs-scene-v12.json` generates two 12-second sources: a distinct waterfall
and replacement open-canopy wind. Wind uses a low-pass filter and compression to
soften isolated sharp rustles. Both are seam-blended infinite loops. Waterfalls
are indexed separately from ordinary water, so a nearer stream tile cannot mask
a visible fall. The new Waterfall source appears in the existing sound editor,
with its own bank, level and range. Old saved mixes receive the missing profile.

Offering clinks now require the payment's offering location to project into the
camera view. Panning away stops an active clink; offscreen receipts are consumed
without replaying later. Gain drops from 0.4 to 0.12 and only one clink plays at a
time. Muting still stops it immediately. These recordings need listening review;
measured output and trigger checks cannot establish whether the new wind feels right.

## Individual NPC voices (v13)

The shared crowd fragment scheduler is replaced by individual speakers. Each
visible NPC tracks its own conversation and reaction timers. A conversational
murmur needs a companion within six tiles; it comes from the speaker's position,
follows their pan/distance and stops when that NPC leaves view. Default per-person
intervals vary from 18–45 seconds for speech and 35–87.5 seconds for reactions,
with independently randomized initial delays. Additional scene-wide spacing
prevents a large crowd from filling every pause. No human recording loops.

`elevenlabs-npc-v13.json` generates six two-second solo murmurs (three male,
three female) and two single, one-second chuckles, 14 requested seconds total.
The runtime selects recordings for the NPC's body voice and alternates takes.
Short existing laughs/calls remain in the reaction bank. Store migration version
4 replaces the stock crowd bank, increases its old short cooldowns and removes
the old long tavern laughter cue. Custom banks, levels and timing edits survive.
The existing event log now includes the emitting NPC's actor ID.

## Indistinct, accumulating murmurs (v14)

The v13 solo voices were too intelligible and foregrounded. The v14 import
recipe reuses those sources without another generation call: speech passes
through two 500 Hz low-pass filters to remove consonants, receives longer fades,
and plays slightly slower. Each source is normalized to −34 dBFS; the per-NPC
conversation gain defaults to 0.65. These are subdued vocal textures, not dialogue.

Each nearby NPC independently contributes a 2.34-second fragment at a randomized
4–10-second interval. More visible people therefore add overlapping murmurs,
rather than taking turns through a shared scheduler. Up to half the voice budget
(default six voices) can contribute at once. Laughs and calls retain separate,
much longer random timers and can displace a footstep when the mix is full.
The bank never loops and all voices track their NPC. Migration version 5 updates
only stock timing/level settings; authored banks and other edits remain intact.
