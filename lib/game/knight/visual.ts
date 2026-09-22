import manifest from "../../../public/textures/knights/v14/manifest.json"
import { populationVisual } from "../base-person/population-assets"
import { personWalkStride } from "../base-person/gait"
import { actionPlaybackRate } from "../base-person/activity"
import { ACTION_CLIPS, type BaseClip } from "../base-person/pose"
import { KNIGHT, knightDesign, squireDesign } from "./design"

const actionImages: Partial<Record<BaseClip, { url: string; depth: string; shadow: string }>> = manifest.person.actionImages

const KNIGHT_TONES = (manifest as { reservedTones?: boolean }).reservedTones === true

/** Shared action lookup for the game, editor and entity thumbnails. */
export function knightPersonClip(requested: BaseClip) {
  const name = requested in manifest.person.frameCounts ? requested as keyof typeof manifest.person.frameCounts : "idle"
  return ({ url: `/textures/knights/${manifest.sourceVersion ?? KNIGHT.version}/knight-${name}.png`, depth: `/textures/knights/${manifest.sourceVersion ?? KNIGHT.version}/depth-knight-${name}.png`, columns: manifest.person.frameCounts[name], rows: manifest.person.rows, stillFrame: 0, ...actionImages[name] })
}

export function knightVisual(variant: number) {
  const row = variant % KNIGHT.variants, design = knightDesign(row)
  const base = populationVisual("knight", row, null), scale = 0.74 * manifest.person.cellSize / 48
  const clip = knightPersonClip
  return { ...base, design, scale, rowOffset: row * 8, reservedTones: KNIGHT_TONES, walkStride: personWalkStride(design, scale),
    center: [manifest.person.anchor[0] / manifest.person.cellSize, 1 - manifest.person.anchor[1] / manifest.person.cellSize] as [number, number],
    walk: { ...clip("walk"), strides: 1 }, idle: clip("idle"),
    actions: Object.fromEntries(ACTION_CLIPS.filter((name): name is typeof name & keyof typeof manifest.person.frameCounts => name in manifest.person.frameCounts).map(name => [name, { ...clip(name), shadow: actionImages[name]?.shadow ?? base.shadow.actions![name], playbackRate: actionPlaybackRate(name, design) }])),
  }
}

/** Loaded walk and standing poses share the same authored legs and equipment. */
export function squireVisual(): ReturnType<typeof populationVisual> {
  const base = populationVisual("merchant", 0, null), data = manifest.squire, design = squireDesign()
  const scale = 0.74 * data.cellSize / 48
  const clip = (name: keyof typeof data.frameCounts) => ({ url: `/textures/knights/${manifest.sourceVersion ?? KNIGHT.version}/squire-${name}.png`, depth: `/textures/knights/${manifest.sourceVersion ?? KNIGHT.version}/depth-squire-${name}.png`, columns: data.frameCounts[name], rows: data.rows, stillFrame: 0 })
  return { ...base, design, scale, rowOffset: 0, reservedTones: KNIGHT_TONES, walkStride: personWalkStride(design, scale),
    center: [data.anchor[0] / data.cellSize, 1 - data.anchor[1] / data.cellSize] as [number, number],
    walk: { ...clip("walk"), strides: 1 }, idle: clip("idle"),
    actions: { wearyWalk: { ...clip("wearyWalk"), strides: 1, shadow: base.shadow.actions!.wearyWalk! } } }
}
