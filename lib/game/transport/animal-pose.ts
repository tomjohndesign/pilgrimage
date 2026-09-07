import { walkFoot, type BodySide, type Point3 } from "../base-person/pose"
import { quadrupedBody, animalProfile, type Animal, type HorseVariant, type QuadrupedProfile } from "./assets"

/** Opposing shoulder/pelvis yaw. A missing twist preserves existing equine bakes. */
export function animalTwist(profile: QuadrupedProfile, phase: number, moving: boolean) {
  return moving ? (profile.twist ?? 0) * Math.sin(phase * Math.PI * 2) : 0
}
function twistedPoint(x: number, z: number, profile: QuadrupedProfile, phase: number, moving: boolean) {
  const yaw = animalTwist(profile, phase, moving) * Math.max(-1, Math.min(1, z / profile.legZ))
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]
}

/** Continuous weight transfer, shared by the skin and every shoulder/hip socket. */
export function animalMotion(kind: Animal, phase: number, moving: boolean, variant: HorseVariant = "common", profile: QuadrupedProfile = animalProfile(kind, variant)) {
  const p = profile, t = phase * Math.PI * 2, active = moving ? 1 : 0
  const motion = { sway: p.sway * Math.sin(t) * active, bob: 0,
    pitch: p.pitch * Math.sin(t * 2 + 0.45) * active, roll: p.roll * Math.sin(t) * active,
    neck: p.neckNod * Math.sin(t * 2 - 0.55) * active,
    head: p.headNod * Math.sin(t * 2 - 1.15) * active,
    tail: 0.12 * Math.sin(t - 0.7) * active }
  // Raise the trunk to the legs' reachable height. This avoids permanent
  // crouched carpi while keeping every planted hoof fixed under a rolling back.
  const reaches: number[] = []
  for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? 1 : -1, z = (rear ? -1 : 1) * p.legZ
    const foot = walkFoot(side, phase + (rear ? 0.25 : 0), quadrupedBody(profile))
    const bones = animalBoneLengths(kind, rear, variant, profile), angle = upperAngle(rear, phase + (rear ? 0.25 : 0) + (side === "right" ? 0.5 : 0), moving)
    const [twistX, twistZ] = twistedPoint(sign * p.legSpread, z, p, phase, moving)
    const x = twistX * Math.cos(motion.roll) + motion.sway
    const hipY = twistX * Math.sin(motion.roll) * Math.cos(motion.pitch) - twistZ * Math.sin(motion.pitch)
    const hipZ = twistX * Math.sin(motion.roll) * Math.sin(motion.pitch) + twistZ * Math.cos(motion.pitch)
    const dz = (moving ? foot.ankle[2] : 0) + z - hipZ - Math.sin(angle) * bones.upper
    const dx = sign * p.legSpread - x
    const reachSquared = bones.middle ** 2 + bones.cannon ** 2 + 2 * bones.middle * bones.cannon * Math.cos(8 * Math.PI / 180)
    reaches.push((moving ? foot.ankle[1] : 0.07) + Math.cos(angle) * bones.upper + Math.sqrt(Math.max(0, reachSquared - dz * dz - dx * dx)) - hipY)
  }
  motion.bob = Math.min(...reaches) - p.legHeight - p.bob * (1 + Math.cos(t * 2)) / 4 * active
  return motion
}

export function spinePoint(point: Point3, kind: Animal, phase: number, moving: boolean, variant: HorseVariant = "common", profile: QuadrupedProfile = animalProfile(kind, variant)): Point3 {
  const p = profile, m = animalMotion(kind, phase, moving, variant, profile)
  const [x, z] = twistedPoint(point[0], point[2], p, phase, moving), height = point[1] - p.legHeight
  // Roll about the barrel's long axis, pitch around its center of mass.
  const rx = x * Math.cos(m.roll) - height * Math.sin(m.roll)
  const ry = x * Math.sin(m.roll) + height * Math.cos(m.roll)
  // The topline flexes between the shoulder and pelvis during weight transfer;
  // joint sockets at legHeight stay on the unchanged contact solution.
  const flex = moving ? Math.sin(phase * Math.PI * 2 + (z < 0 ? Math.PI : 0)) * 0.025 * Math.max(0, Math.min(1, height / 0.4)) : 0
  return [rx + m.sway, p.legHeight + ry * Math.cos(m.pitch) - z * Math.sin(m.pitch) + m.bob + flex,
    ry * Math.sin(m.pitch) + z * Math.cos(m.pitch)]
}

function jointBetween(start: Point3, end: Point3, upper: number, lower: number, bendDirection: number): Point3 {
  const delta = end.map((v, i) => v - start[i]), distance = Math.hypot(...delta)
  if (distance > upper + lower + 1e-8 || distance < Math.abs(upper - lower)) throw new Error(`Animal limb cannot reach its hoof (${distance.toFixed(3)} / ${(upper + lower).toFixed(3)}).`)
  const axis = delta.map(v => v / distance)
  const reach = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const bend = Math.sqrt(Math.max(0, upper * upper - reach * reach))
  const pole = axis.map((v, i) => (i === 2 ? bendDirection : 0) - v * axis[2] * bendDirection)
  const length = Math.hypot(...pole)
  return start.map((v, i) => v + axis[i] * reach + pole[i] / length * bend) as Point3
}

export function animalBoneLengths(kind: Animal, rear: boolean, variant: HorseVariant = "common", profile: QuadrupedProfile = animalProfile(kind, variant)) {
  const height = profile.legHeight
  return { upper: height * (rear ? 0.36 : 0.28), middle: height * (rear ? 0.40 : 0.37), cannon: height * (rear ? 0.40 : 0.37) }
}

function upperAngle(rear: boolean, phase: number, moving: boolean) {
  return (rear ? 0.7 : -0.15) + (moving ? Math.cos(phase * Math.PI * 2) * (rear ? 0.19 : 0.4) : 0)
}

/** Equine elbow/stifle, carpus/hock and fetlock, over the shared walkFoot targets. */
export function animalLeg(kind: Animal, side: BodySide, rear: boolean, phase: number, moving: boolean, variant: HorseVariant = "common", profile: QuadrupedProfile = animalProfile(kind, variant)) {
  const p = profile, body = quadrupedBody(profile), bones = animalBoneLengths(kind, rear, variant, profile)
  const legPhase = phase + (rear ? 0.25 : 0), sidePhase = legPhase + (side === "right" ? 0.5 : 0)
  const sign = side === "left" ? 1 : -1, z = (rear ? -1 : 1) * p.legZ
  const target = walkFoot(side, legPhase, body)
  const ankle: Point3 = moving ? [target.ankle[0], target.ankle[1], target.ankle[2] + z] : [sign * p.legSpread, body.ankleHeight, z]
  const hip = spinePoint([sign * p.legSpread, p.legHeight, z], kind, phase, moving, variant, profile)
  // Forearm descends from a rearward elbow; the stifle points forward and the hock backward.
  const angle = upperAngle(rear, sidePhase, moving)
  return solveAnimalLeg(hip, ankle, bones, angle, rear, !moving || target.planted)
}

/** Shared fixed-length shoulder/elbow/hock solver for equines and wildlife gaits. */
export function solveAnimalLeg(hip: Point3, ankle: Point3, bones: { upper: number; middle: number; cannon: number }, angle: number, rear: boolean, planted: boolean) {
  const upperJoint: Point3 = [hip[0], hip[1] - Math.cos(angle) * bones.upper, hip[2] + Math.sin(angle) * bones.upper]
  const knee = jointBetween(upperJoint, ankle, bones.middle, bones.cannon, rear ? -1 : 1)
  return { hip, upperJoint, knee, ankle, planted }
}
