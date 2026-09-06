import manifest from "../../../public/textures/characters/monks/v5/manifest.json"
import { DEFAULT_WALK_SPEED, DEFAULT_WALK_STRIDE, personWalkStride, walkSpeedScale } from "./gait"
import { actionPlaybackRate } from "./activity"
import { ACTION_CLIPS } from "./pose"
import { personRecipe, validatePersonDesign } from "./design"
import type { populationVisual } from "./population-assets"

/** The editor's Monk preset, baked once and shared by every resident brother. */
export const MONK_VISUAL: ReturnType<typeof populationVisual> = {
  walk: { url: manifest.images.walk, columns: manifest.frameCount, rows: manifest.directions.length, stillFrame: 0 },
  idle: { url: manifest.images.idle, columns: 1, rows: manifest.directions.length, stillFrame: 0 },
  actions: Object.fromEntries(ACTION_CLIPS.map(clip => [clip, {
    ...manifest.images.actions[clip], playbackRate: actionPlaybackRate(clip, validatePersonDesign(manifest.design)), columns: manifest.clips[clip].length / manifest.directions.length,
    rows: manifest.directions.length, stillFrame: 0,
  }])),
  shadow: { walk: manifest.images.shadowWalk, idle: manifest.images.shadowIdle },
  center: [manifest.anchor[0] / manifest.cellSize, 1 - manifest.anchor[1] / manifest.cellSize],
  fps: 8,
  scale: 0.74 * manifest.cellSize / 48,
  rowOffset: 0,
  strideRatio: personRecipe(validatePersonDesign(manifest.design)).body.stride / personRecipe().body.stride,
  design: validatePersonDesign(manifest.design),
  walkStride: personWalkStride(validatePersonDesign(manifest.design), 0.74 * manifest.cellSize / 48, manifest.camera.viewSize),
}

/** Use the same size setting as travelers for both rendered stride and travel. */
export function monkWalkSpeed(characterScale: number): number {
  return DEFAULT_WALK_SPEED * walkSpeedScale(MONK_VISUAL.walkStride, characterScale)
}
export const MONK_WALK_TUNING = { sync: true, stride: DEFAULT_WALK_STRIDE }
