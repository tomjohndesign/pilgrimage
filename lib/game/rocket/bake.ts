import { personFrameRenderer } from "../base-person/bake"
import { BASE_PERSON, PERSON_CLIPS, type BaseClip } from "../base-person/pose"
import { monkVisual } from "../base-person/monk-assets"
import { createRocketRig, ROCKET_PALETTE } from "./rig"

/** New equipment uses the shipped monks' designs, poses, camera, ink and scale. */
export async function bakeRocketMonks() {
  const images: Record<string, string> = {}
  let safePadding = BASE_PERSON.cellSize
  const frameCounts = { ...Object.fromEntries(Object.entries(PERSON_CLIPS).map(([name, clip]) => [name, clip.frames])), flying: 8 }
  for (const [hair, age] of [["brown", 30], ["grey", 80]] as const) {
    const session = personFrameRenderer(monkVisual(age).design, ROCKET_PALETTE)
    let gear: ReturnType<typeof createRocketRig> | undefined
    try {
      for (const [name, frames] of Object.entries(frameCounts)) {
        const canvas = document.createElement("canvas")
        canvas.width = BASE_PERSON.cellSize * frames; canvas.height = BASE_PERSON.cellSize * 8
        const ctx = canvas.getContext("2d")!
        for (let row = 0; row < 8; row++) for (let frame = 0; frame < frames; frame++) {
          const phase = frame / frames
          const result = session.render(name === "flying" ? "idle" : name as BaseClip, phase, row, false, rig => {
            gear ??= createRocketRig(rig)
            gear.pose(phase, name === "flying")
          })
          safePadding = Math.min(safePadding, result.padding)
          ctx.drawImage(result.canvas, frame * BASE_PERSON.cellSize, row * BASE_PERSON.cellSize)
        }
        images[`${hair}-${name}`] = canvas.toDataURL()
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } finally { gear?.dispose(); session.dispose() }
  }
  return { images, metadata: { version: 3, templateVersion: BASE_PERSON.version, cellSize: BASE_PERSON.cellSize,
    anchor: BASE_PERSON.anchor, camera: BASE_PERSON.camera, directions: BASE_PERSON.directions, frameCounts, flightFps: 12, safePadding } }
}
