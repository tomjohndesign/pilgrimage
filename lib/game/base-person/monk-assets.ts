import manifest from "../../../public/textures/characters/monks/v2/manifest.json"
import { ACTION_CLIPS, PERSON_CLIPS } from "./pose"
import { validatePersonDesign } from "./design"
import type { populationVisual } from "./population-assets"

/** The editor's Monk preset, baked once and shared by every resident brother. */
export const MONK_VISUAL: ReturnType<typeof populationVisual> = {
  walk: { url: manifest.images.walk, columns: manifest.frameCount, rows: manifest.directions.length, stillFrame: 0 },
  idle: { url: manifest.images.idle, columns: 1, rows: manifest.directions.length, stillFrame: 0 },
  actions: Object.fromEntries(ACTION_CLIPS.map(clip => [clip, {
    ...manifest.images.actions[clip], columns: PERSON_CLIPS[clip].frames,
    rows: manifest.directions.length, stillFrame: 0,
  }])),
  shadow: { walk: manifest.images.shadowWalk, idle: manifest.images.shadowIdle },
  center: [manifest.anchor[0] / manifest.cellSize, 1 - manifest.anchor[1] / manifest.cellSize],
  fps: 8,
  scale: 0.74 * manifest.cellSize / 48,
  rowOffset: 0,
  strideRatio: 1,
  design: validatePersonDesign(manifest.design),
}
