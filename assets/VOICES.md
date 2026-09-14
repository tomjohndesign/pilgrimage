# Selection barks

## Character playground

Open `/assets/characters?sounds=1` and choose a calling or settlement job in the
existing character controls. The Sounds mode groups event preview, clip banks, timing, mixing and QA in
that editor; JSON import/export stays in its footer. Preset greetings now
resolve to their actual calling and body instead of sharing the peasant fallback. The old floating panel and global
road-loop player were removed. See [scene audio](SCENE-AUDIO.md) for authoring,
QA, runtime behavior, research and the environmental layers still to build.

The v6 plan `assets/recipes/elevenlabs-character-v6.json` generates greetings
for every calling and settlement job's supported body voices: 24 recordings,
plus 13 short footstep, tool and environmental effects. Yorkshire peasants use
George/Lily and default to pitch-preserving 120% playback; Daniel's monk uses
warm, patient direction at natural pitch. Other callings now resolve to their
own recorded greeting rather than placeholder speech. Previous accent and
neutral dialogue comparisons remain assignable in the clip bank.

Generate with `node --env-file=.env.local scripts/generate-elevenlabs-sounds.mjs
--plan assets/recipes/elevenlabs-character-v6.json --generate` (one shell line;
omit `--generate` for a dry run). Import with `python3
scripts/import-elevenlabs-sounds.py --plan
assets/recipes/elevenlabs-character-v6.json`. Originals and billing records are
in `.context/elevenlabs-character-v6`; playable WAVs are in
`public/sounds/elevenlabs/v6`. Never commit `.env.local` or generation logs.
The runtime catalog is `assets/recipes/elevenlabs-audition.json`.

The batch consumed 436 credits according to the account's before/after usage:
4,793 → 5,229 of 10,000, leaving 4,771 in that allowance. No plan upgrade or
payment was made. Playback has no ElevenLabs usage cost. These Free-tier assets
remain prototype recordings; generation does not establish commercial rights.

Speech targets are editorial IPA approximations, not specialist-verified Old
English. Church Latin uses a conventional ecclesiastical reading. Modern
regional accents are artistic direction, not proof of historical accuracy.
See [accent research](VOICE-ACCENTS.md). The WAV importer trims outer speech
silence, targets -20 dBFS RMS for voices and -25 for effects, caps sample peaks
at -3 dBFS and avoids boosting quiet effects more than 6 dB. v6 includes peak
and RMS metadata for the QA controls; level checks do not substitute for listening.

## The tongues

The laity speak **Old English**; the friar and the nun speak **Church Latin**.
This follows Age of Empires II, where units speak the language of their
civilisation and the player reads the meaning rather than the words. It also
keeps the audio inside the late Dark Ages to early Middle Ages window the rest
of the art works to — a modern English line would date the scene the moment it
was spoken.

Because the tongue is not meant to be understood by ear, the traveler panel in
the HUD prints the line and its English gloss while it plays.

## Men and women

Every line is recorded twice, once per body type, and a person always answers in
a voice that matches the body on screen. `travelerBodyType` in
[`population.ts`](../lib/game/base-person/population.ts) is the single source of
that: names, sprites and barks all read it, so a person can never sound like
someone else. Friars are always male and nuns always female, so they have one
voice each; `voiceBodyType` falls back to a calling's only voice when asked for
the other.

Note that the game does generate women in callings a player might not expect,
knights among them. The voice follows the body, so that is where any change
belongs, not here.

## The line bank

[`assets/recipes/voices.json`](recipes/voices.json) holds every line. Each has
three fields, and they are not interchangeable:

| Field | Purpose |
| --- | --- |
| `text` | The authentic line. **This is what a voice actor reads**, and what the HUD prints. |
| `phonetic` | A respelling used *only* by the placeholder TTS render. Never shown, never read by an actor. |
| `gloss` | The English meaning, printed under the character's activity in the panel. |

Every character needs at least three `select` lines and one `repeat` line.
`npm test lib/game/voice-lines.test.ts` enforces that, and that every traveler
type has a voice.

The lines themselves are not gendered — the Old English and the Latin both read
the same in either mouth — so only the rendered audio differs. `prototype` names
the placeholder TTS voice and speaking rate per body type:

```json
"prototype": {
  "Male":   { "voice": "Rocko", "rate": 168 },
  "Female": { "voice": "Sandy", "rate": 170 }
}
```

## Selection variation

`barkForStreak` in [`lib/game/voice-lines.ts`](../lib/game/voice-lines.ts) cycles
the `select` bank. Legacy `repeat` lines remain archived but are never selected.
A sequence continues while the same traveler is re-selected within
`BARK_STREAK_MS`. Placeholder openers vary by traveler id; the recorded audition
starts with its first line, then cycles the three recorded options.

## Placeholder audio, and replacing it

`npm run assets:voices` renders every line with the macOS `say` voices into
`public/sounds/voices/`. **That directory is gitignored and the audio must not
ship**: Apple's voices are licensed for use on the machine, not for
redistribution, and this repository anticipates commercial releases. The
placeholders exist so the interaction can be heard and tuned.

The game degrades gracefully. When a bark file is missing, `playCharacterSound`
falls back to the synthesized selection cue from
[`assets/recipes/sounds.json`](recipes/sounds.json), so a fresh clone with no
generated barks still sounds the way it did before.

To replace the placeholders, put real recordings at the same paths
(`public/sounds/voices/<type>/<male|female>/<line-id>-v<version>.wav`) and commit
them. The line ids in the recipe are the contract; nothing else needs to change.
Note that this is two readings of every line — 80 clips at the current bank size.
Options,
in rough order of how well they fit a commercial release:

1. **Record actors** — at least one man and one woman — reading the `text`
   column. Full ownership, and the only route that gets Old English pronounced
   rather than approximated.
2. **A permissively licensed local TTS** such as Piper or Kokoro, which can be
   run from a script like the placeholder one and whose licences allow
   commercial use. Needs the `phonetic` column, and will approximate.
3. **A paid TTS API** such as ElevenLabs, whose paid tiers grant commercial
   rights. Needs credentials, which no other asset script in this repo requires.

## Noise correction in v5

The previous very quiet forest and conversation outputs had been amplified by
roughly 23 and 48 dB, which also raised their noise. Replacement birds use light
noise reduction and no positive gain. The attempted replacement conversation
was still nearly silent and is excluded from runtime audio. Instead the shipped
conversation is assembled from the clean Yorkshire male/female recordings,
with overlapping snippets, 90% tempo and a 180–1200 Hz passband. The derivation
is saved in the plan's `mix` field and reproduced by the importer. No noise
boost is needed. The discarded source response remains in `.context` for audit.

The importer now caps ordinary SFX gain at 6 dB; the replacement bird source
explicitly caps it at zero. Historical-language and subjective listening review
remain separate from waveform and browser playback checks.
