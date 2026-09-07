import { walkFoot, type Point3 } from "../base-person/pose"
import { solveAnimalLeg } from "../transport/animal-pose"
import { quadrupedBody, RIG_TO_WORLD } from "../transport/assets"
import { MAMMAL_ANATOMY, limbBones, type MammalKind } from "./anatomy"
import { BURROW_STRIDE } from "./burrow-motion"
import { animalOffset, type AnimalRigEdits, type AnimalClip, type AnimalJoint } from "./rig-edits"
import { WILDLIFE_PROFILES, type WildlifeKind } from "./species"

export type WildlifeGait = "walk" | "trot" | "canter" | "gallop" | "hop" | "leap"
export type WildlifeAction = "idle" | "graze" | "lie" | "burrow"
export const GAIT_LABELS: Record<WildlifeGait, string> = { walk: "Walk", trot: "Trot", canter: "Lope", gallop: "Run", hop: "Hop", leap: "Leap" }
export const wrapPhase = (phase: number) => ((phase % 1) + 1) % 1

/** Touchdown phases: front L/R, hind L/R. See REFERENCES.md for observed sequences.
 * The values are animation timings, not a claim of measured species constants. */
const CONTACTS: Record<WildlifeGait, [number, number, number, number]> = {
  walk: [0.25, 0.75, 0, 0.5], trot: [0, 0.5, 0.5, 0],
  canter: [0.46, 0.23, 0.23, 0], gallop: [0.48, 0.60, 0, 0.12],
  hop: [0.45, 0.49, 0, 0], leap: [0.57, 0.60, 0, 0.025],
}
export function speciesGaits(kind: WildlifeKind): WildlifeGait[] {
  if (kind === "rabbit") return ["hop"]
  if (kind === "fox") return ["walk", "trot", "canter", "gallop"]
  if (kind === "deer" || kind === "buck") return ["walk", "trot", "canter", "gallop", "leap"]
  if (kind === "boar") return ["walk", "trot"]
  return ["walk"]
}
export function gaitRecipe(kind: WildlifeKind, gait: WildlifeGait, edits?: AnimalRigEdits) {
  const p = WILDLIFE_PROFILES[kind]
  const stance = gait === "walk" ? kind === "sheep" || kind === "goat" ? 0.76 : 0.68 : gait === "trot" ? kind === "boar" ? 0.58 : 0.52 : gait === "canter" ? 0.38 : gait === "gallop" ? 0.30 : gait === "hop" ? 0.28 : 0.26
  const reach = p.stride * ({ walk: 1, trot: 1.2, canter: 1.25, gallop: 1.4, hop: 1.9, leap: 1.2 }[gait])
  const lift = gait === "walk" ? p.lift : p.legHeight * ({ trot: 0.18, canter: 0.30, gallop: 0.43, hop: 0.9, leap: 0.55 }[gait])
  const cadence = gait === "walk" ? p.cyclesPerSecond * (kind === "sheep" ? 0.65 : kind === "goat" ? 0.72 : 1) : gait === "hop" ? 1.65 : p.cyclesPerSecond * ({ trot: 1.35, canter: 1.15, gallop: 1.65, leap: 0.85 }[gait])
  return { stance, reach, lift, cadence: cadence * (edits?.clips[gait]?.cadence ?? 1), contacts: CONTACTS[gait].map((phase, limb) => phase + (edits?.clips[gait]?.contacts?.[limb] ?? 0)), stride: 2 * reach / stance }
}
export function gaitStride(kind: WildlifeKind, gait: WildlifeGait, scale: number) { return gaitRecipe(kind, gait).stride * RIG_TO_WORLD * scale }
export function gaitSpeed(kind: WildlifeKind, gait: WildlifeGait, scale: number, edits?: AnimalRigEdits) { return gaitStride(kind, gait, scale) * gaitRecipe(kind, gait, edits).cadence }

/** Contact velocities use the very same stance/swing curve as people and equines. */
export function gaitFoot(kind: WildlifeKind, gait: WildlifeGait, phase: number, limb: number, amount = 1, edits?: AnimalRigEdits, clip?: AnimalClip) {
  const p = WILDLIFE_PROFILES[kind], g = clip === "burrow" ? {stance:.65,reach:BURROW_STRIDE*.65/2,lift:.035,contacts:[0,.03,.5,.53]} : gaitRecipe(kind, gait, edits)
  const foot = walkFoot("left", phase - g.contacts[limb], { ...quadrupedBody(p), stride: g.reach * amount, footLift: g.lift * amount }, g.stance)
  const anatomy = MAMMAL_ANATOMY[kind as MammalKind], rest = (limb >= 2 ? anatomy.hind : anatomy.front).points[3]
  foot.ankle[0] = rest[0] * (limb % 2 ? -1 : 1)
  foot.ankle[1] += rest[1] - 0.07
  foot.ankle[2] += rest[2]
  return foot
}

/** A complete pose is solved once, including support height, then reused by the hide. */
export function wildlifePose(kind: WildlifeKind, gait: WildlifeGait, phase: number, amount = 1, lying = 0, edits?: AnimalRigEdits, clip: AnimalClip = gait, keyPhase = phase) {
  const p = WILDLIFE_PROFILES[kind], anatomy = MAMMAL_ANATOMY[kind as MammalKind], cycle = phase * Math.PI * 2
  const running = gait === "canter" || gait === "gallop" || gait === "hop" || gait === "leap"
  const twist = (p.twist ?? 0) * (gait === "trot" ? 0.2 : running ? 0.3 : 1) * Math.sin(cycle) * amount
  const pitch = (running ? kind === "rabbit" ? 0.13 : 0.055 : p.pitch) * Math.sin(cycle + 0.4) * amount
  const roll = (running || gait === "trot" ? 0.008 : p.roll) * Math.sin(cycle) * amount
  const sway = p.sway * Math.sin(cycle) * amount * (running ? 0.25 : 1)
  const flex = (kind === "rabbit" ? 0.06 : kind === "fox" ? 0.045 : 0.012) * Math.cos(cycle) * (running ? amount : 0)
  const trunkPoint = (point: Point3, height: number): Point3 => {
    const weight = Math.max(-1, Math.min(1, point[2] / p.legZ)), yaw = twist * weight
    const x = point[0] * Math.cos(yaw) + point[2] * Math.sin(yaw), z = -point[0] * Math.sin(yaw) + point[2] * Math.cos(yaw)
    const y = point[1] - anatomy.height + flex * Math.max(0, 1 - weight * weight)
    const rx = x * Math.cos(roll) - y * Math.sin(roll), ry = x * Math.sin(roll) + y * Math.cos(roll)
    return [rx + sway, height + ry * Math.cos(pitch) - z * Math.sin(pitch), ry * Math.sin(pitch) + z * Math.cos(pitch)]
  }
  const targets = [0, 1, 2, 3].map(limb => {
    const rear = limb >= 2, foot = gaitFoot(kind, gait, phase, limb, amount, edits, clip), limbAnatomy = rear ? anatomy.hind : anatomy.front, bones = limbBones(limbAnatomy)
    const local = wrapPhase(phase - gaitRecipe(kind, gait, edits).contacts[limb])
    const angle = Math.atan2(limbAnatomy.points[1][2] - limbAnatomy.points[0][2], limbAnatomy.points[0][1] - limbAnatomy.points[1][1]) + Math.cos(local * Math.PI * 2) * (rear ? 0.2 : 0.35) * amount
    const hip = trunkPoint([limbAnatomy.points[0][0] * (limb % 2 ? -1 : 1), limbAnatomy.points[0][1], limbAnatomy.points[0][2]], 0)
    const dx = foot.ankle[0] - hip[0], dz = foot.ankle[2] - hip[2] - Math.sin(angle) * bones.upper
    const reach = bones.middle ** 2 + bones.cannon ** 2 + 2 * bones.middle * bones.cannon * Math.cos(8 * Math.PI / 180)
    return { foot, bones, angle, hip, rear, height: foot.ankle[1] + Math.cos(angle) * bones.upper + Math.sqrt(Math.max(0, reach - dx * dx - dz * dz)) - hip[1] }
  })
  const reachable = Math.min(...targets.map(target => target.height)) - p.bob * 0.15 * amount
  const height = Math.min(reachable, anatomy.height + (reachable - anatomy.height) * amount)
  // Resting height follows a crouch, with the paws tucked beneath the ribs.
  const bodyHeight = height * (1 - lying) + (kind === "fox" ? 0.15 : 0.25) * lying
  const spine = (point: Point3) => trunkPoint(point, bodyHeight)
  const legs = targets.map(({ foot, bones, angle, rear, hip }, limb) => {
    hip[1] += bodyHeight
    const ankle: Point3 = [...foot.ankle]
    ankle[2] += (rear ? 0.06 : 0.10) * lying
    // Folding the upper limb back into the flank makes a real lying pose, with fixed bones.
    let folded = angle * (1 - lying) + (rear ? 1.8 : -1.15) * lying
    if (lying > 0 || clip === "burrow") {
      // Keep a fixed-length upper bone inside the lower chain's reachable cone.
      const dy = ankle[1] - hip[1], dz = ankle[2] - hip[2], dx = ankle[0] - hip[0], planar = Math.hypot(dy, dz)
      const axis = Math.atan2(dz, -dy), radius = bones.middle + bones.cannon - 1e-6
      const spread = Math.acos(Math.max(-1, Math.min(1, (dx*dx + planar*planar + bones.upper*bones.upper - radius*radius) / (2*bones.upper*planar))))
      folded = Math.max(axis - spread, Math.min(axis + spread, folded))
      if(clip === "burrow") {
        const inner=Math.abs(bones.middle-bones.cannon)+1e-6
        const minimum=Math.acos(Math.max(-1,Math.min(1,(dx*dx+planar*planar+bones.upper*bones.upper-inner*inner)/(2*bones.upper*planar))))
        if(Math.abs(folded-axis)<minimum)folded=axis+(folded<axis?-1:1)*minimum
      }
    }
    if (!foot.planted && amount > 0) {
      const joint = (["leftHand", "rightHand", "leftFoot", "rightFoot"] as AnimalJoint[])[limb], offset = animalOffset(edits, clip, joint, keyPhase)
      for (let i = 0; i < 3; i++) ankle[i] += offset[i]
      ankle[1] = Math.max((rear ? anatomy.hind : anatomy.front).points[3][1], ankle[1])
      const upper: Point3 = [hip[0], hip[1] - Math.cos(folded) * bones.upper, hip[2] + Math.sin(folded) * bones.upper]
      const delta = ankle.map((n, i) => n - upper[i]), length = Math.hypot(...delta)
      const reach = Math.min(bones.middle + bones.cannon - 0.0001, Math.max(Math.abs(bones.middle - bones.cannon) + 0.0001, length))
      if (length > 0) for (let i = 0; i < 3; i++) ankle[i] = upper[i] + delta[i] / length * reach
      const floor = (rear ? anatomy.hind : anatomy.front).points[3][1]
      if (ankle[1] < floor) {
        ankle[1] = floor
        const horizontal = Math.hypot(ankle[0] - upper[0], ankle[2] - upper[2])
        const allowed = Math.sqrt(Math.max(0, (bones.middle + bones.cannon - .0001)**2 - (floor - upper[1])**2))
        if (horizontal > allowed) for (const i of [0,2]) ankle[i] = upper[i] + (ankle[i] - upper[i]) * allowed / horizontal
      }
    }
    return solveAnimalLeg(hip, ankle, bones, folded, rear, foot.planted || amount === 0)
  })
  return { spine, legs, height: bodyHeight, pitch, roll, twist, sway, flex }
}
