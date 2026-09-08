import greyManifest from "../../../public/textures/characters/monks/v41/manifest.json"
import { GREY_HAIR_AGE } from "../character-age"
import manifest from "../../../public/textures/characters/monks/v40/manifest.json"
import { DEFAULT_WALK_SPEED, DEFAULT_WALK_STRIDE, personWalkStride, walkSpeedScale } from "./gait"
import { actionPlaybackRate } from "./activity"
import { ACTION_CLIPS, BASE_PERSON } from "./pose"
import { personRecipe, validatePersonDesign } from "./design"
import type { populationVisual } from "./population-assets"

/** The same Monk preset and animation metadata for both hair colors. */
function visualForMonk(manifest: typeof greyManifest): ReturnType<typeof populationVisual> {
  return {
    walk: { strides: "walkStrides" in manifest ? Number(manifest.walkStrides) : 1, url: manifest.images.walk, depth: manifest.images.depthWalk, columns: manifest.frameCount, rows: manifest.directions.length, stillFrame: 0 },
    idle: { url: manifest.images.idle, depth: manifest.images.depthIdle, columns: 1, rows: manifest.directions.length, stillFrame: 0 },
    actions: Object.fromEntries(ACTION_CLIPS.map(clip => [clip, {
      ...manifest.images.actions[clip], playbackRate: actionPlaybackRate(clip, validatePersonDesign(manifest.design)), columns: manifest.clips[clip].length / manifest.directions.length,
      rows: manifest.directions.length, stillFrame: 0,
    }])),
    shadow: { walk: manifest.images.shadowWalk, idle: manifest.images.shadowIdle },
    center: [manifest.anchor[0] / manifest.cellSize, 1 - manifest.anchor[1] / manifest.cellSize],
    fps: BASE_PERSON.defaultFps,
    scale: 0.74 * manifest.cellSize / 48,
    rowOffset: 0,
    reservedTones: (manifest as { reservedTones?: boolean }).reservedTones === true,
    strideRatio: personRecipe(validatePersonDesign(manifest.design)).body.stride / personRecipe().body.stride,
    design: validatePersonDesign(manifest.design),
    walkStride: personWalkStride(validatePersonDesign(manifest.design), 0.74 * manifest.cellSize / 48, manifest.camera.viewSize),
  }
}

export const MONK_VISUAL = visualForMonk(manifest)
const GREY_MONK_VISUAL = visualForMonk(greyManifest)

export function monkVisual(age: number) {
  return age >= GREY_HAIR_AGE ? GREY_MONK_VISUAL : MONK_VISUAL
}

/** Use the same size setting as travelers for both rendered stride and travel. */
export function monkWalkSpeed(characterScale: number): number {
  return DEFAULT_WALK_SPEED * walkSpeedScale(MONK_VISUAL.walkStride, characterScale)
}
export const MONK_WALK_TUNING = { sync: true, stride: DEFAULT_WALK_STRIDE }

/** Baked hand registrations keep the single carried relic on both palms. */
export function monkRelicAttachment(age: number) {
  const source = age >= GREY_HAIR_AGE ? greyManifest : manifest
  return { clips: source.clips, cellSize: source.cellSize, anchor: source.anchor }
}

export function monkRelicTrayWidth(characterScale: number): number {
  return 2 * personRecipe(MONK_VISUAL.design).body.shoulderOffset * MONK_VISUAL.scale / BASE_PERSON.camera.viewSize * characterScale + 0.03
}
