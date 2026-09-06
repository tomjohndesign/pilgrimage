import { RIG_TO_WORLD, type Puller } from "./assets"
import { KEEPER_SEAT, stallLayout } from "./stall"
import { routeLength, routePoint, type Point } from "./roadside"

export const KEEPER_CLIPS = { wave: { start: 0, frames: 12 }, offer: { start: 12, frames: 12 }, sit: { start: 24, frames: 8 } } as const
export const KEEPER_COLUMNS = 32
export interface KeeperPose extends Point {
  pose: "idle" | "walk" | keyof typeof KEEPER_CLIPS; phase: number; heading: number; moving: boolean; atHome: boolean
}
/** A short repeatable shop routine in rig coordinates. Walking time comes from
 * the keeper's own stride; no position jumps at loop boundaries or while seated. */
export function keeperRoutine(seconds: number, puller: Puller, scale: number, stride: number, audience = true): KeeperPose {
  const home = stallLayout(puller).merchant, browse = { x: home.x, z: puller === "hand" ? -0.1 : -0.65 }
  const corner = { x: home.x, z: KEEPER_SEAT.z }
  const routes = [[home, browse], [browse, corner, KEEPER_SEAT], [KEEPER_SEAT, corner, home]]
  const speed = stride * 0.7 / (RIG_TO_WORLD * scale)
  const durations = routes.map(route => routeLength(route) / speed)
  const stages = [3, durations[0], 2, durations[1], 5, durations[2]]
  const total = stages.reduce((a, b) => a + b, 0)
  let time = ((seconds % total) + total) % total
  for (let i = 0; i < stages.length; i++) {
    if (time < stages[i] || i === stages.length - 1) {
      const phase = time / stages[i]
      if (i % 2) {
        const p = routePoint(routes[(i - 1) / 2], time * speed)
        return { ...p, pose: "walk", phase, moving: true, atHome: false }
      }
      return { ...(i === 0 ? home : i === 2 ? browse : KEEPER_SEAT), pose: i === 4 ? "sit" : audience ? i === 0 ? "wave" : "offer" : "idle",
        phase, heading: -Math.PI / 2, moving: false, atHome: i === 0 }
    }
    time -= stages[i]
  }
  throw new Error("Missing keeper routine stage")
}
