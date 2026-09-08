import { GREY_HAIR_AGE } from "../character-age"
import { personWalkStride } from "./gait"
import { actionPlaybackRate } from "./activity"
import { ACTION_CLIPS, type ActionClip } from "./pose"
import type { SpriteClip } from "../character-assets"
import manifest from "../../../public/textures/characters/population/v30/manifest.json"
import type { TravelerTypeId } from "../travelers"
import { validatePersonDesign } from "./design"
import type { PopulationPack } from "./population"

export const DEFAULT_POPULATION: PopulationPack = { ...manifest, callings: Object.fromEntries(
  Object.entries(manifest.callings).map(([type, entry]) => [type, { ...entry, designs: entry.designs.map(validatePersonDesign) }]),
) as PopulationPack["callings"], greyCallings: Object.fromEntries(
  Object.entries(manifest.greyCallings).map(([type, entry]) => [type, { ...entry, designs: entry.designs.map(validatePersonDesign) }]),
) as PopulationPack["greyCallings"] }

export function populationVisual(type: TravelerTypeId, variant: number, custom: PopulationPack | null, age = 18) {
  const pack = custom ?? DEFAULT_POPULATION
  const calling = (age >= GREY_HAIR_AGE ? pack.greyCallings?.[type] : undefined) ?? pack.callings[type]
  return outfitVisual(pack, calling, variant)
}

export function outfitVisual<Calling extends string>(pack: PopulationPack<Calling>, calling: PopulationPack<Calling>["callings"][Calling], variant: number) {
  return {
    walk: { strides: pack.walkStrides ?? 1, url: calling.walk, depth: calling.depths?.walk, columns: pack.frameCounts?.walk ?? 8, rows: pack.rows, stillFrame: 0 },
    idle: { url: calling.idle, depth: calling.depths?.idle, columns: 1, rows: pack.rows, stillFrame: 0 },
    actions: Object.fromEntries(ACTION_CLIPS.flatMap(clip => {
      const url = calling.actions?.[clip], shadow = pack.shadows.actions?.[clip]
      return url && shadow ? [[clip, { url, depth: calling.depths?.[clip], shadow, playbackRate: actionPlaybackRate(clip, calling.designs[variant]), columns: pack.frameCounts?.[clip] ?? pack.actionFrames?.[clip] ?? 8, rows: pack.rows, stillFrame: 0 }]] : []
    })) as Partial<Record<ActionClip, SpriteClip & { shadow: string }>>,
    shadow: pack.shadows,
    center: [pack.anchor[0] / pack.cellSize, 1 - pack.anchor[1] / pack.cellSize] as [number, number],
    fps: 18, scale: 0.74 * pack.cellSize / 48,
    rowOffset: variant * 8,
    strideRatio: pack.strideRatios[variant],
    reservedTones: pack.reservedTones === true,
    walkStride: personWalkStride(calling.designs[variant], 0.74 * pack.cellSize / 48),
    design: calling.designs[variant],
  }
}
