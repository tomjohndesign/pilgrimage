import { plantFoot, walkContact, crossedWalkSupport, type FootPlant } from "../base-person/gait"
import { walkingSurface } from "../map/walking-surface"
import type { GameMap } from "../map/types"
import { createEnt, ENT_LEG_HEIGHT, stepEnt, type EntState } from "./ents"
import { entFramePose, entStride, DEFAULT_ENT_DESIGN, ENT_FRAMES, type EntDesign } from "./ent-rig"
import type { TreePlacement } from "./placement"

export interface EntActor {
  index: number; tree: TreePlacement; state: EntState; phase: number; frame: number; column: number
  x: number; y: number; z: number; lift: number; visible: boolean; plant: FootPlant | null
}
export function createEntActors(trees: TreePlacement[], seed: number) {
  return trees.flatMap((tree, index): EntActor[] => {
    const state = createEnt(tree, seed, index)
    return state ? [{ index, tree, state, phase: 0, frame: ENT_FRAMES, column: 0, x: tree.x, y: tree.y, z: tree.z, lift: 0, visible: false, plant: null }] : []
  })
}
/** Update simulation even off screen. Both sprite parts share the displayed foot's correction. */
export function advanceEntActor(actor: EntActor, map: GameMap, delta: number, yaw: number, design: EntDesign = DEFAULT_ENT_DESIGN, reserved = false) {
  const { state, tree } = actor, before = state.phase, x = state.x, z = state.z
  const stride = entStride(tree.species, design)
  if (!(reserved && state.phase === "rooted")) {
    let remaining = Math.max(0, Math.min(delta, 2))
    while (remaining > 1e-8) { const dt = Math.min(.1, remaining); stepEnt(state, map, dt, { stride, seconds: design.seconds }); remaining -= dt }
  }
  const distance = Math.hypot(state.x - x, state.z - z)
  if (before === "rooted" && state.phase !== "rooted") actor.phase = 0
  const advance = distance / stride
  if (crossedWalkSupport(actor.phase, advance, ENT_FRAMES)) actor.plant = null
  actor.phase += advance
  actor.visible = state.phase !== "rooted"
  tree.walking = actor.visible
  tree.x = state.x; tree.z = state.z
  if (actor.visible || before !== "rooted") tree.y = walkingSurface(map, tree.x, tree.z).height
  actor.x = tree.x; actor.y = tree.y; actor.z = tree.z
  // Keep the last planted pose while lowering back into the forest floor.
  actor.frame = state.phase === "rising" || state.phase === "rooted" ? ENT_FRAMES : Math.floor((actor.phase % 1) * ENT_FRAMES + 1e-8) % ENT_FRAMES
  actor.column = ((-Math.round(state.heading / (Math.PI / 4)) % 8) + 8) % 8
  const pose = entFramePose(tree.species, actor.frame, design)
  actor.lift = pose.height * Math.min(1, state.lift / ENT_LEG_HEIGHT)
  // Fixed-length roots rise out of, and sink into, the ground; never stretch the bones.
  if (actor.visible) actor.y -= pose.height - actor.lift
  if (state.phase === "walking") {
    const foot = walkContact(actor.phase, ENT_FRAMES, pose.body)
    const view = Math.round(yaw / (Math.PI / 4)), heading = yaw - (view + actor.column) * Math.PI / 4
    const contact = { x: foot.x * Math.cos(heading) + foot.z * Math.sin(heading), z: -foot.x * Math.sin(heading) + foot.z * Math.cos(heading) }
    const result = plantFoot(actor.plant, `${foot.side}:${heading.toFixed(3)}`, tree, contact, (x, z) => walkingSurface(map, x, z).height)
    actor.plant = result.plant
    actor.x += result.offset.x; actor.y += result.offset.y; actor.z += result.offset.z
  } else actor.plant = null
  return actor.visible || before !== "rooted" || distance > 0
}
