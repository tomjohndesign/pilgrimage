import manifest from "../../../public/textures/knights/v7/manifest.json"
import { populationVisual } from "../base-person/population-assets"
import { personWalkStride } from "../base-person/gait"
import { actionPlaybackRate } from "../base-person/activity"
import { ACTION_CLIPS } from "../base-person/pose"
import { KNIGHT, knightDesign, squireDesign } from "./design"

export function knightVisual(variant: number) {
  const row = variant % KNIGHT.variants, design = knightDesign(row)
  const base = populationVisual("knight", row, null), scale = 0.74 * manifest.person.cellSize / 48
  const clip = (name: keyof typeof manifest.person.frameCounts) => ({ url: `/textures/knights/${KNIGHT.version}/knight-${name}.png`, depth: `/textures/knights/${KNIGHT.version}/depth-knight-${name}.png`, columns: manifest.person.frameCounts[name], rows: manifest.person.rows, stillFrame: 0 })
  return { ...base, design, scale, rowOffset: row * 8, walkStride: personWalkStride(design, scale),
    center: [manifest.person.anchor[0] / manifest.person.cellSize, 1 - manifest.person.anchor[1] / manifest.person.cellSize] as [number, number],
    walk: { ...clip("walk"), strides: 1 }, idle: clip("idle"),
    actions: Object.fromEntries(ACTION_CLIPS.map(name => [name, { ...clip(name), shadow: base.shadow.actions![name], playbackRate: actionPlaybackRate(name, design) }])),
  }
}

/** Loaded walk and standing poses share the same authored legs and equipment. */
export function squireVisual() {
  const base = populationVisual("merchant", 0, null), data = manifest.squire, design = squireDesign()
  const scale = 0.74 * data.cellSize / 48
  const clip = (name: keyof typeof data.frameCounts) => ({ url: `/textures/knights/${KNIGHT.version}/squire-${name}.png`, depth: `/textures/knights/${KNIGHT.version}/depth-squire-${name}.png`, columns: data.frameCounts[name], rows: data.rows, stillFrame: 0 })
  return { ...base, design, scale, rowOffset: 0, walkStride: personWalkStride(design, scale),
    center: [data.anchor[0] / data.cellSize, 1 - data.anchor[1] / data.cellSize] as [number, number],
    walk: { ...clip("walk"), strides: 1 }, idle: clip("idle"), actions: {} }
}
