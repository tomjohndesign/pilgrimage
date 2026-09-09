import manifest from "../../../public/textures/transport/v26/manifest.json"
import { populationVisual } from "../base-person/population-assets"
import { personWalkStride } from "../base-person/gait"
import { validatePersonDesign } from "../base-person/design"

/** Replace locomotion only; a parked vendor retains every normal activity. */
export function pullingVisual(variant: number) {
  const asset = manifest.puller
  const design = validatePersonDesign(asset.designs[variant]), scale = 0.74 * asset.cellSize / 48
  const base = populationVisual("vendor", variant, null)
  return {
    ...base,
    walk: { url: `/textures/transport/${manifest.version}/puller-walk.png`, depth: `/textures/transport/${manifest.version}/depth-puller-walk.png`, columns: asset.frames, strides: asset.strides, rows: asset.rows, stillFrame: 0 },
    idle: { url: `/textures/transport/${manifest.version}/puller-idle.png`, depth: `/textures/transport/${manifest.version}/depth-puller-idle.png`, columns: asset.idleFrames, rows: asset.rows, stillFrame: 0 },
    actions: { ...base.actions, wearyWalk: {
      url: `/textures/transport/${manifest.version}/puller-wearyWalk.png`, depth: `/textures/transport/${manifest.version}/depth-puller-wearyWalk.png`,
      columns: asset.frames, strides: asset.strides, rows: asset.rows, stillFrame: 0, shadow: base.shadow.actions!.wearyWalk!,
    } },
    center: [asset.anchor[0] / asset.cellSize, 1 - asset.anchor[1] / asset.cellSize] as [number, number],
    fps: 18, scale, rowOffset: variant * manifest.directions.length, strideRatio: 1,
    // Locomotion comes from the transport atlas; it carries reserved tones from the same bake.
    reservedTones: (manifest.puller as { reservedTones?: boolean }).reservedTones === true,
    walkStride: personWalkStride(design, scale, asset.camera.viewSize), design,
  }
}
