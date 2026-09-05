import recipe from "../../../assets/recipes/base-person.json"

export const BASE_PERSON = recipe
export type Point3 = [number, number, number]
export type BodySide = "left" | "right"
export const SOCKET_NAMES = ["head", "back", "leftHip", "rightHip", "leftHand", "rightHand"] as const
export type SocketName = typeof SOCKET_NAMES[number]
export type BaseClip = "idle" | "walk"

export interface LegPose {
  hip: Point3
  knee: Point3
  ankle: Point3
  planted: boolean
}

/** +Z is forward; +X is the person's own LEFT, which appears right in front view. */
export function legPose(side: BodySide, phase: number, clip: BaseClip, b = BASE_PERSON.body): LegPose {
  const x = (side === "left" ? 1 : -1) * b.legOffset
  const p = ((phase + (side === "right" ? 0.5 : 0)) % 1 + 1) % 1
  const planted = clip === "idle" || p < 0.6
  const u = Math.max(0, (p - 0.6) / 0.4)
  const eased = u * u * (3 - 2 * u)
  const z = clip === "idle" ? 0 : planted ? b.stride * (1 - 2 * p / 0.6) : b.stride * (2 * eased - 1)
  const y = b.ankleHeight + (planted ? 0 : b.footLift * Math.sin(u * Math.PI))
  const hip: Point3 = [x, b.hipHeight, 0]
  const ankle: Point3 = [x, y, z]
  // Two-bone IK: the knee always bends forward, lengths never change.
  const dy = y - hip[1]
  const distance = Math.hypot(dy, z)
  const a = (b.thighLength ** 2 - b.shinLength ** 2 + distance ** 2) / (2 * distance)
  const bend = Math.sqrt(Math.max(0, b.thighLength ** 2 - a ** 2))
  const knee: Point3 = [x, hip[1] + dy / distance * a + z / distance * bend, z / distance * a - dy / distance * bend]
  return { hip, knee, ankle, planted }
}

export function armAngle(side: BodySide, phase: number, clip: BaseClip) {
  return clip === "idle" ? 0 : Math.cos(phase * Math.PI * 2) * 0.36 * (side === "left" ? 1 : -1)
}

export function baseFrame(phase: number) {
  return Math.floor(((phase % 1 + 1) % 1) * BASE_PERSON.framesPerCycle)
}
