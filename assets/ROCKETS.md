# Blaster Pastor

The cheat `blasterpastor` equips the resident monks for occasional rocket trips.
Entering it again recalls every airborne monk and removes each pack after
landing. Grounded monks put their packs away immediately. A recall during
takeoff finishes the vertical climb before returning above the shrine; landing
is always vertical. Pause and playback speed apply to flight and flame animation.

`lib/game/rocket/rig.ts` attaches the steel boosters and flame helmet to the
shared person's back and head sockets. The baker uses the shipped brown/grey
monk designs, shared walking and action poses, 64px camera, registration and
ink. All equipment is baked into the body silhouette, so scaling, ground
contacts, terrain overlap and selection use the shared `CharacterSprite` renderer.
Flight has a separate eight-frame flame clip with timing in its manifest.

To export from the existing development character editor:

```sh
node scripts/export-rocket-monks.mjs --url http://localhost:3247
```

The v4 exporter refuses to overwrite published files. For subsequent revisions,
allocate a new directory and asset version in the exporter and baker, and update
the manifest import in `lib/game/rocket/assets.ts` after exporting. Base person
and ordinary monk sheets are unaffected by equipment-only edits. Re-export the
rocket family when changing its source monk rig or designs.

Validate with `npm test`, `npm run typecheck`, and visual checks in `/play`:
activate and recall during climbing/cruising/landing, pause and resume, rotate
the camera, and compare equipped monks with ordinary characters at the same
zoom, including selection and overlap.
