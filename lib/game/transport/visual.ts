import manifest from "../../../public/textures/transport/v20/manifest.json"
import { populationVisual } from "../base-person/population-assets"
import { personWalkStride } from "../base-person/gait"
import { validatePersonDesign } from "../base-person/design"

/** Replace locomotion only; a parked vendor retains every normal activity. */
export function pullingVisual(variant: number) {
  const asset = manifest.puller
  const design = validatePersonDesign(asset.designs[variant]), scale = 0.74 * asset.cellSize / 48
  return {
    ...populationVisual("vendor", variant, null),
    walk: { url: `/textures/transport/${manifest.version}/puller-walk.png`, depth: `/textures/transport/${manifest.version}/depth-puller-walk.png`, columns: asset.frames, strides: asset.strides, rows: asset.rows, stillFrame: 0 },
    idle: { url: `/textures/transport/${manifest.version}/puller-idle.png`, depth: `/textures/transport/${manifest.version}/depth-puller-idle.png`, columns: asset.idleFrames, rows: asset.rows, stillFrame: 0 },
    center: [asset.anchor[0] / asset.cellSize, 1 - asset.anchor[1] / asset.cellSize] as [number, number],
    fps: 18, scale, rowOffset: variant * manifest.directions.length, strideRatio: 1,
    walkStride: personWalkStride(design, scale, asset.camera.viewSize), design,
  }
}
