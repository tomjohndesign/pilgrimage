import manifest from "../../../public/textures/characters/population/v1/manifest.json"
import type { TravelerTypeId } from "../travelers"
import type { PopulationPack } from "./population"

export const DEFAULT_POPULATION = manifest as PopulationPack

export function populationVisual(type: TravelerTypeId, variant: number, custom: PopulationPack | null) {
  const pack = custom ?? DEFAULT_POPULATION, calling = pack.callings[type]
  return {
    walk: { url: calling.walk, columns: 8, rows: pack.rows, stillFrame: 0 },
    idle: { url: calling.idle, columns: 1, rows: pack.rows, stillFrame: 0 },
    shadow: pack.shadows,
    center: [pack.anchor[0] / pack.cellSize, 1 - pack.anchor[1] / pack.cellSize] as [number, number],
    fps: 8, scale: 0.74 * pack.cellSize / 48,
    rowOffset: variant * 8,
    strideRatio: pack.strideRatios[variant],
    design: calling.designs[variant],
  }
}
