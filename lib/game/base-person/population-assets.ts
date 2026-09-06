import { actionPlaybackRate } from "./activity"
import { ACTION_CLIPS, type ActionClip } from "./pose"
import type { SpriteClip } from "../character-assets"
import manifest from "../../../public/textures/characters/population/v4/manifest.json"
import type { TravelerTypeId } from "../travelers"
import { validatePersonDesign } from "./design"
import type { PopulationPack } from "./population"

export const DEFAULT_POPULATION: PopulationPack = { ...manifest, callings: Object.fromEntries(
  Object.entries(manifest.callings).map(([type, entry]) => [type, { ...entry, designs: entry.designs.map(validatePersonDesign) }]),
) as PopulationPack["callings"] }

export function populationVisual(type: TravelerTypeId, variant: number, custom: PopulationPack | null) {
  const pack = custom ?? DEFAULT_POPULATION, calling = pack.callings[type]
  return {
    walk: { url: calling.walk, columns: 8, rows: pack.rows, stillFrame: 0 },
    idle: { url: calling.idle, columns: 1, rows: pack.rows, stillFrame: 0 },
    actions: Object.fromEntries(ACTION_CLIPS.flatMap(clip => {
      const url = calling.actions?.[clip], shadow = pack.shadows.actions?.[clip]
      return url && shadow ? [[clip, { url, shadow, playbackRate: actionPlaybackRate(clip, calling.designs[variant]), columns: pack.actionFrames?.[clip] ?? 8, rows: pack.rows, stillFrame: 0 }]] : []
    })) as Partial<Record<ActionClip, SpriteClip & { shadow: string }>>,
    shadow: pack.shadows,
    center: [pack.anchor[0] / pack.cellSize, 1 - pack.anchor[1] / pack.cellSize] as [number, number],
    fps: 8, scale: 0.74 * pack.cellSize / 48,
    rowOffset: variant * 8,
    strideRatio: pack.strideRatios[variant],
    design: calling.designs[variant],
  }
}
