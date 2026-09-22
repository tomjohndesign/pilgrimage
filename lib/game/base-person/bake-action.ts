import { personFrameRenderer, type FrameRegistration } from "./bake"
import { validatePersonDesign, type PersonDesign } from "./design"
import { ACTION_CLIPS, BASE_PERSON, PERSON_CLIPS, type ActionClip } from "./pose"
import { equipKnight } from "../knight/rig"
import { createRocketRig, ROCKET_PALETTE } from "../rocket/rig"

/** Add one action to a published family without re-rendering its unchanged clips. */
export async function bakePersonAction(clip: ActionClip, designs: PersonDesign[], equipment?: "knight" | "rocket") {
  if (!ACTION_CLIPS.includes(clip) || !designs.length) throw new Error("Unknown action or empty family")
  const size = BASE_PERSON.cellSize, columns = PERSON_CLIPS[clip].frames
  const sheet = () => {
    const canvas = document.createElement("canvas")
    canvas.width = size * columns; canvas.height = size * 8 * designs.length
    return canvas
  }
  const color = sheet(), depth = sheet(), shadow = sheet()
  const frames: FrameRegistration[] = []
  let padding = size
  for (const [variant, design] of designs.entries()) {
    const session = personFrameRenderer(validatePersonDesign(design), equipment === "rocket" ? ROCKET_PALETTE :
      equipment === "knight" ? ["#42494b", "#626a6d", "#858c8d", "#a4b4b5"] : [])
    let knight: ReturnType<typeof equipKnight> | undefined
    let rocket: ReturnType<typeof createRocketRig> | undefined
    try {
      for (let row = 0; row < 8; row++) {
        for (let frame = 0; frame < columns; frame++) {
          const phase = frame / columns
          const result = session.render(clip, phase, row, false, rig => {
            if (equipment === "knight") { knight ??= equipKnight(rig, variant); knight.pose(clip) }
            if (equipment === "rocket") { rocket ??= createRocketRig(rig); rocket.pose(phase, false, clip) }
          })
          const x = frame * size, y = (variant * 8 + row) * size
          color.getContext("2d")!.drawImage(result.canvas, x, y)
          depth.getContext("2d")!.drawImage(result.depth!, x, y)
          shadow.getContext("2d")!.drawImage(result.shadow!, x, y)
          frames.push({ direction: BASE_PERSON.directions[row], frame, phase, sockets: result.sockets })
          padding = Math.min(padding, result.padding)
        }
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } finally { knight?.dispose(); rocket?.dispose(); session.dispose() }
  }
  return { url: color.toDataURL(), depth: depth.toDataURL(), shadow: shadow.toDataURL(), frames,
    columns, rows: designs.length * 8, cellSize: size, anchor: BASE_PERSON.anchor, padding }
}
