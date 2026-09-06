import manifest from "../../../public/textures/characters/monks/v1/manifest.json"
import { validatePersonDesign } from "./design"
import type { populationVisual } from "./population-assets"

/** The editor's Monk preset, baked once and shared by every resident brother. */
export const MONK_VISUAL: ReturnType<typeof populationVisual> = {
  walk: { url: manifest.images.walk, columns: manifest.frameCount, rows: manifest.directions.length, stillFrame: 0 },
  idle: { url: manifest.images.idle, columns: 1, rows: manifest.directions.length, stillFrame: 0 },
  shadow: { walk: manifest.images.shadowWalk, idle: manifest.images.shadowIdle },
  center: [manifest.anchor[0] / manifest.cellSize, 1 - manifest.anchor[1] / manifest.cellSize],
  fps: 8,
  scale: 0.74 * manifest.cellSize / 48,
  rowOffset: 0,
  strideRatio: 1,
  design: validatePersonDesign(manifest.design),
}
