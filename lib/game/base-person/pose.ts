import recipe from "../../../assets/recipes/base-person.json"
import { SPLITTING_FRAMES, splittingMotion } from "./splitting"

export const BASE_PERSON = recipe
export type Point3 = [number, number, number]
export type BodySide = "left" | "right"
export const SOCKET_NAMES = ["head", "back", "leftHip", "rightHip", "leftHand", "rightHand"] as const
export type SocketName = typeof SOCKET_NAMES[number]
export const PERSON_CLIPS = {
  idle: { label: "Idle", frames: 1 },
  walk: { label: "Walking", frames: 8 },
  sleeping: { label: "Sleeping", frames: 16 },
  sitting: { label: "Sitting", frames: 8 },
  praying: { label: "Praying", frames: 8 },
  treeFelling: { label: "Chopping · standing tree", frames: 24 },
  woodcutting: { label: "Chopping · fallen wood", frames: SPLITTING_FRAMES },
  gathering: { label: "Gathering", frames: 24 },
  carrying: { label: "Carrying", frames: 8 },
} as const
export type BaseClip = keyof typeof PERSON_CLIPS
export const ACTION_CLIPS = ["sleeping", "sitting", "praying", "treeFelling", "woodcutting", "gathering", "carrying"] as const
export type ActionClip = typeof ACTION_CLIPS[number]

export function choppingHipDrop(clip: BaseClip, phase = 0, hipHeight = BASE_PERSON.body.hipHeight) {
  if (clip === "woodcutting") return Math.max(splittingMotion(phase).drop, 0.22 - hipHeight)
  return clip === "treeFelling" ? -0.08 : 0
}

export interface LegPose {
  hip: Point3
  knee: Point3
  ankle: Point3
  planted: boolean
}

/** +Z is forward; +X is the person's own LEFT, which appears right in front view. */
export function legPose(side: BodySide, phase: number, clip: BaseClip, b = BASE_PERSON.body): LegPose {
  if (clip === "sitting" || clip === "praying" || clip === "gathering") {
    const x = (side === "left" ? 1 : -1) * b.legOffset
    const kneeling = clip !== "sitting"
    const hip: Point3 = [x, clip === "gathering" ? 0.22 : kneeling ? 0.1 + b.thighLength * 0.9 : 0.25, 0]
    const kneeY = kneeling ? 0.1 : 0.1 + b.shinLength * 0.8
    const knee: Point3 = [x, kneeY, Math.sqrt(Math.max(0.01, b.thighLength ** 2 - (hip[1] - kneeY) ** 2))]
    const ankle: Point3 = [x, 0.1, knee[2] + b.shinLength * (kneeling ? -1 : 0.6)]
    return { hip, knee, ankle, planted: true }
  }
  if (clip === "treeFelling" || clip === "woodcutting") {
    const sign = side === "left" ? 1 : -1
    const hip: Point3 = [sign * b.legOffset, b.hipHeight + choppingHipDrop(clip, phase, b.hipHeight), 0]
    const ankle: Point3 = [sign * (b.legOffset + 0.15), b.ankleHeight, sign * 0.16]
    const delta = ankle.map((v, i) => v - hip[i])
    const distance = Math.hypot(...delta)
    const axis = delta.map(v => v / distance)
    // Project forward onto the knee's bend plane: planted feet, fixed bone lengths.
    const squat = clip === "woodcutting" ? Math.max(0, (-choppingHipDrop(clip, phase, b.hipHeight) - 0.20) / 0.24) : 0
    const desired = [sign * squat * 0.6, squat * 1.5, 1]
    const dot = desired.reduce((sum, v, i) => sum + v * axis[i], 0)
    const bend = desired.map((v, i) => v - axis[i] * dot)
    const bendLength = Math.hypot(...bend)
    const along = (b.thighLength ** 2 - b.shinLength ** 2 + distance ** 2) / (2 * distance)
    const height = Math.sqrt(Math.max(0, b.thighLength ** 2 - along ** 2))
    const knee = hip.map((v, i) => v + axis[i] * along + bend[i] / bendLength * height) as Point3
    return { hip, knee, ankle, planted: true }
  }
  const walking = clip === "walk" || clip === "carrying"
  const x = (side === "left" ? 1 : -1) * b.legOffset
  const p = ((phase + (side === "right" ? 0.5 : 0)) % 1 + 1) % 1
  const planted = !walking || p < 0.6
  const u = Math.max(0, (p - 0.6) / 0.4)
  const eased = u * u * (3 - 2 * u)
  const z = !walking ? 0 : planted ? b.stride * (1 - 2 * p / 0.6) : b.stride * (2 * eased - 1)
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
  return clip !== "walk" ? 0 : Math.cos(phase * Math.PI * 2) * 0.36 * (side === "left" ? 1 : -1)
}

export function baseFrame(phase: number) {
  return Math.floor(((phase % 1 + 1) % 1) * BASE_PERSON.framesPerCycle)
}
