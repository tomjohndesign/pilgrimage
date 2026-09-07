import { WALK_STANCE_FRACTION, walkFoot, type BodySide, type Point3 } from "../base-person/pose"
import { animalBody, animalProfile, type Animal, type HorseVariant } from "./assets"

/** Continuous weight transfer, shared by the skin and every shoulder/hip socket. */
export function animalMotion(kind: Animal, phase: number, moving: boolean, variant: HorseVariant = "common") {
  const p = animalProfile(kind, variant), t = phase * Math.PI * 2, active = moving ? 1 : 0
  const motion = { sway: p.sway * Math.sin(t) * active, bob: 0,
    pitch: p.pitch * Math.sin(t * 2 + 0.45) * active, roll: p.roll * Math.sin(t) * active,
    neck: (p.walkNeckLean + p.neckNod * Math.sin(t * 2 - 0.55)) * active,
    head: p.headNod * Math.sin(t * 2 - 1.15) * active,
    tail: 0.12 * Math.sin(t - 0.7) * active }
  // Raise the trunk to the legs' reachable height. This avoids permanent
  // crouched carpi while keeping every planted hoof fixed under a rolling back.
  const reaches: number[] = []
  for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? 1 : -1, z = (rear ? -1 : 1) * p.legZ
    const foot = walkFoot(side, phase + (rear ? 0.25 : 0), animalBody(kind, variant))
    const bones = animalBoneLengths(kind, rear, variant), angle = upperAngle(rear, moving ? foot.ankle[2] / p.stride : 0)
    const x = sign * p.legSpread * Math.cos(motion.roll) + motion.sway
    const hipY = sign * p.legSpread * Math.sin(motion.roll) * Math.cos(motion.pitch) - z * Math.sin(motion.pitch)
    const hipZ = sign * p.legSpread * Math.sin(motion.roll) * Math.sin(motion.pitch) + z * Math.cos(motion.pitch)
    const dz = (moving ? foot.ankle[2] : 0) + z - hipZ - Math.sin(angle) * bones.upper
    const dx = sign * p.legSpread - x
    const reachSquared = bones.middle ** 2 + bones.cannon ** 2 + 2 * bones.middle * bones.cannon * Math.cos(8 * Math.PI / 180)
    reaches.push((moving ? foot.ankle[1] : 0.07) + Math.cos(angle) * bones.upper + Math.sqrt(Math.max(0, reachSquared - dz * dz - dx * dx)) - hipY)
  }
  const lowest = Math.min(...reaches)
  // A conservative smooth minimum transfers weight without a sharp vertical
  // change when the next supporting leg becomes the limiting reach.
  const support = moving ? lowest - Math.log(reaches.reduce((sum, reach) => sum + Math.exp((lowest - reach) * 100), 0)) / 100 : lowest
  motion.bob = support - p.legHeight - p.bob * (1 + Math.cos(t * 2)) / 4 * active
  return motion
}

export function spinePoint(point: Point3, kind: Animal, phase: number, moving: boolean, variant: HorseVariant = "common"): Point3 {
  const p = animalProfile(kind, variant), m = animalMotion(kind, phase, moving, variant)
  const [x, y, z] = point, height = y - p.legHeight
  // Roll about the barrel's long axis, pitch around its center of mass.
  const rx = x * Math.cos(m.roll) - height * Math.sin(m.roll)
  const ry = x * Math.sin(m.roll) + height * Math.cos(m.roll)
  // The topline flexes between the shoulder and pelvis during weight transfer;
  // joint sockets at legHeight stay on the unchanged contact solution.
  const flex = moving ? Math.sin(phase * Math.PI * 2 + (z < 0 ? Math.PI : 0)) * p.spineFlex * Math.max(0, Math.min(1, height / 0.4)) : 0
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

export function animalBoneLengths(kind: Animal, rear: boolean, variant: HorseVariant = "common") {
  const height = animalProfile(kind, variant).legHeight
  return { upper: height * (rear ? 0.36 : 0.28), middle: height * (rear ? 0.40 : 0.37), cannon: height * (rear ? 0.40 : 0.37) }
}

function upperAngle(rear: boolean, forwardReach: number) {
  // The shoulder/elbow and hip/stifle follow the actual hoof sweep. A separate
  // sinusoid led the foot during stance and made the forelegs look like marching.
  return (rear ? 0.7 : -0.15) + forwardReach * (rear ? 0.2 : 0.28)
}

/** Equine elbow/stifle, carpus/hock and fetlock, over the shared walkFoot targets. */
export function animalLeg(kind: Animal, side: BodySide, rear: boolean, phase: number, moving: boolean, variant: HorseVariant = "common") {
  const p = animalProfile(kind, variant), body = animalBody(kind, variant), bones = animalBoneLengths(kind, rear, variant)
  const legPhase = phase + (rear ? 0.25 : 0), sidePhase = legPhase + (side === "right" ? 0.5 : 0)
  const sign = side === "left" ? 1 : -1, z = (rear ? -1 : 1) * p.legZ
  const target = walkFoot(side, legPhase, body)
  const planted = !moving || target.planted
  const cycle = ((sidePhase % 1) + 1) % 1
  const swing = Math.max(0, (cycle - WALK_STANCE_FRACTION) / (1 - WALK_STANCE_FRACTION))
  const folding = planted ? 0 : Math.sin(Math.PI * swing) ** 2
  const ankle: Point3 = moving ? [target.ankle[0], target.ankle[1], target.ankle[2] + z] : [sign * p.legSpread, body.ankleHeight, z]
  const hip = spinePoint([sign * p.legSpread, p.legHeight, z], kind, phase, moving, variant)
  // Forearm descends from a rearward elbow; the stifle points forward and the hock backward.
  const angle = upperAngle(rear, moving ? target.ankle[2] / p.stride : 0)
  let upperJoint: Point3 = [hip[0], hip[1] - Math.cos(angle) * bones.upper, hip[2] + Math.sin(angle) * bones.upper]
  if (!rear) {
    // A loaded foreleg is a nearly straight column below the elbow. Let the
    // upper arm absorb shoulder motion; fold the carpus only on the return.
    const flex = 8 * Math.PI / 180 + 0.9 * folding
    const lowerReach = Math.sqrt(bones.middle ** 2 + bones.cannon ** 2 + 2 * bones.middle * bones.cannon * Math.cos(flex))
    const distance = Math.hypot(...ankle.map((value, i) => value - hip[i]))
    const reachable = Math.max(Math.abs(distance - bones.upper) + 1e-7, Math.min(distance + bones.upper - 1e-7, lowerReach))
    upperJoint = jointBetween(hip, ankle, bones.upper, reachable, -1)
  }
  const knee = jointBetween(upperJoint, ankle, bones.middle, bones.cannon, rear ? -1 : 1)
  // Fold the toe down as the unloaded hoof passes under the body, then open
  // it before landing. Stance retains the exact flat, distance-driven contact.
  const hoofPitch = Math.min(0.65, p.lift / 0.12) * folding
  return { hip, upperJoint, knee, ankle, planted, hoofPitch }
}
