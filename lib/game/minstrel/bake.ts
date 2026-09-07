import { personFrameRenderer } from "../base-person/bake"
import { BASE_PERSON } from "../base-person/pose"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import { playingPose } from "./pose"
import { SPRITE_DEPTH_ENCODING } from "../render/bake-depth"

/** Same camera, pixel ink, standing legs and six profiles as road travelers. */
export async function bakeMinstrels() {
  const frames = 16, rows = 48, size = BASE_PERSON.cellSize
  const canvas = document.createElement("canvas")
  canvas.width = size * frames; canvas.height = size * rows
  const context = canvas.getContext("2d")!
  const depth = document.createElement("canvas")
  depth.width = canvas.width; depth.height = canvas.height
  const depthContext = depth.getContext("2d")!
  let safePadding = size
  for (let variant = 0; variant < 6; variant++) {
    const session = personFrameRenderer(populationDesign(TRAVELER_TYPES.minstrel, variant))
    try {
      for (let row = 0; row < 8; row++) for (let frame = 0; frame < frames; frame++) {
        const phase = frame / frames
        const result = session.render("idle", phase, row, false, rig => playingPose(rig, session.recipe, phase))
        safePadding = Math.min(safePadding, result.padding)
        context.drawImage(result.canvas, frame * size, (variant * 8 + row) * size)
        depthContext.drawImage(result.depth!, frame * size, (variant * 8 + row) * size)
      }
    } finally { session.dispose() }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { image: canvas.toDataURL(), depth: depth.toDataURL(), metadata: { version: 3, depthEncoding: SPRITE_DEPTH_ENCODING, templateVersion: BASE_PERSON.version,
    frames, rows, fps: 16, cellSize: size, anchor: BASE_PERSON.anchor, safePadding } }
}
