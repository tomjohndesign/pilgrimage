import { BUILDING_FRAMES } from "./building"
import recipe from "../../../assets/recipes/base-person.json"
import { SPLITTING_FRAMES, splittingMotion } from "./splitting"

export const BASE_PERSON = recipe
export const WALK_STANCE_FRACTION = 0.6
export type Point3 = [number, number, number]
export type BodySide = "left" | "right"
export const SOCKET_NAMES = ["head", "back", "leftHip", "rightHip", "leftHand", "rightHand"] as const
export type SocketName = typeof SOCKET_NAMES[number]
export const WALK_CLIP_STRIDES = 1
export const WALK_FRAMES_PER_STRIDE = 20
export const PERSON_CLIPS = {
  idle: { label: "Idle", frames: 1 },
  walk: { label: "Walking", frames: WALK_FRAMES_PER_STRIDE * WALK_CLIP_STRIDES },
  sleeping: { label: "Sleeping", frames: 16 },
  sitting: { label: "Sitting", frames: 8 },
  seatedPrayer: { label: "Seated prayer", frames: 8 },
  praying: { label: "Praying", frames: 8 },
  preaching: { label: "Preaching", frames: 24 },
  treeFelling: { label: "Chopping · standing tree", frames: 24 },
  woodcutting: { label: "Chopping · fallen wood", frames: SPLITTING_FRAMES },
  building: { label: "Building · wooden mallet", frames: BUILDING_FRAMES },
  gathering: { label: "Gathering", frames: 24 },
  carrying: { label: "Carrying", frames: 20 },
  hoisting: { label: "Hoisting relic", frames: 16 },
  procession: { label: "Carrying overhead", frames: 20 },
} as const
export type BaseClip = keyof typeof PERSON_CLIPS
export const ACTION_CLIPS = ["sleeping", "sitting", "seatedPrayer", "praying", "treeFelling", "woodcutting", "building", "gathering", "carrying", "hoisting", "procession", "preaching"] as const
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

/** A foot target, shared by IK, the atlas baker and runtime contact locking. */
export function walkFoot(side: BodySide, phase: number, b = BASE_PERSON.body, stance = WALK_STANCE_FRACTION) {
  const p = ((phase + (side === "right" ? 0.5 : 0)) % 1 + 1) % 1
  const planted = p < stance
  const u = Math.max(0, (p - stance) / (1 - stance))
  const eased = u * u * (3 - 2 * u)
  // Match the backwards ground velocity at both ends of swing. The foot
  // lifts before passing the supporting leg and settles gently at contact.
  const tangent = 2 * b.stride / stance * (1 - stance)
  const z = planted ? b.stride * (1 - 2 * p / stance)
    : b.stride * (2 * eased - 1) - tangent * u * (1 - u) * (1 - 2 * u)
  return { ankle: [(side === "left" ? 1 : -1) * b.legOffset,
    b.ankleHeight + (planted ? 0 : b.footLift * Math.sin(u * Math.PI) ** 2), z] as Point3, planted }
}

/** Small opposing hip/chest turns, with one soft head bounce per footfall. */
export function walkBody(phase: number, clip: BaseClip) {
  const moving = clip === "walk" || clip === "carrying" || clip === "procession"
  const cycle = ((phase % 1 + 1) % 1) * Math.PI * 2
  const hipYaw = moving ? -Math.cos(cycle) * 0.065 : 0
  return { hipYaw, chestYaw: -hipYaw * 0.75,
    headBob: moving ? 0.012 * (1 - Math.cos(cycle * 2)) : 0 }
}

function hipOffset(side: BodySide, phase: number, clip: BaseClip, b = BASE_PERSON.body): Point3 {
  const x = (side === "left" ? 1 : -1) * b.legOffset
  const { hipYaw } = walkBody(phase, clip)
  return [x * Math.cos(hipYaw), 0, -x * Math.sin(hipYaw)]
}

/** Let the support leg extend, rather than forcing both knees into a crouch. */
export function pelvisHeight(phase: number, clip: BaseClip, b = BASE_PERSON.body): number {
  if (clip === "treeFelling" || clip === "woodcutting") return b.hipHeight + choppingHipDrop(clip, phase, b.hipHeight)
  if (clip === "sleeping") return b.hipHeight
  if (clip === "seatedPrayer") return b.ankleHeight + b.shinLength
  if (clip === "sitting") return 0.25
  if (clip === "praying") return 0.1 + b.thighLength * 0.9
  if (clip === "gathering") return 0.22
  // Eight degrees of resting knee flexion: upright, without locking the joint.
  const reachSquared = b.thighLength ** 2 + b.shinLength ** 2
    + 2 * b.thighLength * b.shinLength * Math.cos(8 * Math.PI / 180)
  if (clip !== "walk" && clip !== "carrying" && clip !== "procession") return b.ankleHeight + Math.sqrt(reachSquared)
  // One pelvis for both legs. Its height follows the most extended leg and
  // falls slightly in double support; it never stretches either leg to reach.
  return Math.min(...(["left", "right"] as const).map(side => {
    const { ankle } = walkFoot(side, phase, b)
    const hip = hipOffset(side, phase, clip, b)
    return ankle[1] + Math.sqrt(Math.max(0, reachSquared - (ankle[2] - hip[2]) ** 2 - (ankle[0] - hip[0]) ** 2))
  }))
}

/** +Z is forward; +X is the person's own LEFT, which appears right in front view. */
export function legPose(side: BodySide, phase: number, clip: BaseClip, b = BASE_PERSON.body): LegPose {
  if (clip === "seatedPrayer") {
    const x = (side === "left" ? 1 : -1) * b.legOffset
    const height = pelvisHeight(phase, clip, b)
    return { hip: [x, height, 0], knee: [x, height, b.thighLength],
      ankle: [x, b.ankleHeight, b.thighLength], planted: true }
  }
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
  const walking = clip === "walk" || clip === "carrying" || clip === "procession"
  const x = (side === "left" ? 1 : -1) * b.legOffset
  const target = walkFoot(side, phase, b)
  const planted = !walking || target.planted
  const [_, y, z] = walking ? target.ankle : [x, b.ankleHeight, 0]
  const hip = hipOffset(side, phase, clip, b)
  hip[1] = pelvisHeight(phase, clip, b)
  const ankle: Point3 = [x, y, z]
  // Two-bone IK: the knee always bends forward, lengths never change.
  const delta = ankle.map((value, i) => value - hip[i])
  const distance = Math.hypot(...delta)
  const axis = delta.map(value => value / distance)
  const a = (b.thighLength ** 2 - b.shinLength ** 2 + distance ** 2) / (2 * distance)
  const bend = Math.sqrt(Math.max(0, b.thighLength ** 2 - a ** 2))
  // Project forward onto the plane perpendicular to the hip/ankle axis.
  const forward = axis.map((value, i) => (i === 2 ? 1 : 0) - value * axis[2])
  const forwardLength = Math.hypot(...forward)
  const knee = hip.map((value, i) => value + axis[i] * a + forward[i] / forwardLength * bend) as Point3
  return { hip, knee, ankle, planted }
}

export function armAngle(side: BodySide, phase: number, clip: BaseClip) {
  return clip !== "walk" ? 0 : Math.cos(phase * Math.PI * 2) * 0.36 * (side === "left" ? 1 : -1)
}

export function baseFrame(phase: number) {
  return Math.floor(((phase % 1 + 1) % 1) * BASE_PERSON.framesPerCycle)
}
