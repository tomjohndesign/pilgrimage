import * as THREE from "three"
import { BASE_PERSON, pelvisHeight, WALK_STANCE_FRACTION, type Point3 } from "../base-person/pose"
import { editedLeg } from "../base-person/edited-leg"
import { poseOffset, validatePoseEdits, type PoseEdits } from "../base-person/pose-edits"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { personCamera } from "../base-person/camera"
import { DEFAULT_DESIGN, personBody } from "../base-person/design"
import { FOLIAGE_SPECIES, type FoliageSpecies } from "./foliage/design"

export const ENT_FRAMES = 20
export const ENT_FRAME = { cellSize: 64, extent: 64 * CHARACTER_PIXEL_SIZE, anchor: [32, 54] as const, directions: 8, rows: 21 * FOLIAGE_SPECIES.length }
export const ENT_JOINT_LABELS = { leftShoulder: "Left branch shoulder", leftElbow: "Left branch elbow", leftHand: "Left twig hand", rightShoulder: "Right branch shoulder", rightElbow: "Right branch elbow", rightHand: "Right twig hand", leftHip: "Left root hip", leftKnee: "Left root knee", leftFoot: "Left root foot", rightHip: "Right root hip", rightKnee: "Right root knee", rightFoot: "Right root foot" }
export type EntJoint = keyof typeof ENT_JOINT_LABELS
export const ENT_BONES: [EntJoint, EntJoint][] = [["leftHip", "leftKnee"], ["leftKnee", "leftFoot"], ["rightHip", "rightKnee"], ["rightKnee", "rightFoot"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftHand"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightHand"]]
export interface EntDesign { version: 1; seconds: number; reach: number; lift: number; poseEdits: PoseEdits }
export const DEFAULT_ENT_DESIGN: EntDesign = { version: 1, seconds: 6, reach: 1, lift: 1, poseEdits: {} }
export function validateEntDesign(input: unknown): EntDesign {
  const d = input as EntDesign
  if (!d || d.version !== 1 || !Number.isFinite(d.seconds) || d.seconds < 3 || d.seconds > 12 ||
    !Number.isFinite(d.reach) || d.reach < .6 || d.reach > 1.2 || !Number.isFinite(d.lift) || d.lift < .5 || d.lift > 1.5) throw new Error("Use Ent settings version 1: stride 3–12 seconds, reach 0.6–1.2, lift 0.5–1.5.")
  const poseEdits = validatePoseEdits(d.poseEdits)
  for (const [clip, joints] of Object.entries(poseEdits)) {
    if (clip !== "walk" || Object.keys(joints).some(j => !Object.hasOwn(ENT_JOINT_LABELS, j))) throw new Error("Ent keys must belong to walking limb joints.")
  }
  return { version: 1, seconds: d.seconds, reach: d.reach, lift: d.lift, poseEdits }
}
/** Root proportions belong to the rendered species; cadence changes never change ground contact. */
export function entBody(species: FoliageSpecies, design = DEFAULT_ENT_DESIGN) {
  const scale = { oak: 1, beech: 1.04, birch: .92, scotsPine: 1.08, hawthorn: .78, holly: .86 }[species]
  return { ...personBody(DEFAULT_DESIGN), hipHeight: .65 * scale, thighLength: .32 * scale, shinLength: .31 * scale,
    ankleHeight: .035, legOffset: .13 * scale, stride: .12 * scale * design.reach, footLift: .09 * design.lift,
    footLength: .2, footWidth: .09 }
}
export function entStride(species: FoliageSpecies, design = DEFAULT_ENT_DESIGN) {
  // Bake extent and sprite extent are identical, so the rig-to-world conversion is 1.
  return 2 * entBody(species, design).stride / WALK_STANCE_FRACTION
}
export function entCamera() {
  return personCamera({ ...BASE_PERSON, cellSize: ENT_FRAME.cellSize, anchor: [...ENT_FRAME.anchor], camera: { ...BASE_PERSON.camera, viewSize: ENT_FRAME.extent } })
}
export function entPose(species: FoliageSpecies, phase: number, design = DEFAULT_ENT_DESIGN, moving = true) {
  const body = entBody(species, design), clip = moving ? "walk" : "idle"
  return { body, height: pelvisHeight(phase, clip, body),
    left: editedLeg("left", phase, clip, body, design.poseEdits), right: editedLeg("right", phase, clip, body, design.poseEdits) }
}
const framePoses = new WeakMap<EntDesign, Map<FoliageSpecies, ReturnType<typeof entPose>[]>>()
/** Gameplay samples the baked poses; solve each rig only once per settings revision. */
export function entFramePose(species: FoliageSpecies, frame: number, design = DEFAULT_ENT_DESIGN) {
  let speciesPoses = framePoses.get(design)
  if (!speciesPoses) { speciesPoses = new Map(); framePoses.set(design, speciesPoses) }
  let poses = speciesPoses.get(species)
  if (!poses) {
    poses = Array.from({ length: ENT_FRAMES + 1 }, (_, i) => entPose(species, i / ENT_FRAMES, design, i < ENT_FRAMES))
    speciesPoses.set(species, poses)
  }
  return poses[frame]
}

/** Branch arms swing against the opposite root. Hand and elbow keys preserve both branch lengths. */
export function entArm(side: "left" | "right", height: number, phase: number, design: EntDesign, moving = true) {
  const sign = side === "left" ? 1 : -1
  const offset = (joint: EntJoint) => new THREE.Vector3(...(moving ? poseOffset(design.poseEdits, "walk", joint, phase) : [0, 0, 0] as Point3))
  const shoulder = new THREE.Vector3(sign * .1, height + .43, 0).add(offset(`${side}Shoulder`))
  const hand = new THREE.Vector3(sign * .39, height + .05, moving ? -sign * Math.cos(phase * Math.PI * 2) * .15 : 0).add(offset(`${side}Hand`))
  const upper = .29, lower = .27, axis = hand.clone().sub(shoulder), distance = Math.max(.025, Math.min(axis.length(), upper + lower - 1e-6))
  if (axis.lengthSq() < 1e-12) axis.set(0, -1, 0)
  axis.normalize(); hand.copy(shoulder).addScaledVector(axis, distance)
  const bend = new THREE.Vector3(sign, 0, -.5).add(offset(`${side}Elbow`))
  bend.addScaledVector(axis, -bend.dot(axis)).normalize()
  const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance)
  const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper ** 2 - along ** 2)))
  return { shoulder: shoulder.toArray() as Point3, elbow: elbow.toArray() as Point3, hand: hand.toArray() as Point3 }
}

/** Articulated bark roots: shared fixed-length leg IK and broad, forked, flat soles.
 * The existing tree crown is a separate sprite attached to the pelvis. */
export function createEntRig(species: FoliageSpecies, design = DEFAULT_ENT_DESIGN) {
  const root = new THREE.Group(), geometry = new THREE.CylinderGeometry(.7, 1, 1, 6)
  const color = { oak: "#5a503d", beech: "#77756a", birch: "#c0b99e", scotsPine: "#74654c", hawthorn: "#5a503d", holly: "#423c30" }[species]
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true })
  const limbs = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(geometry, material); root.add(m); return m })
  const a = new THREE.Vector3(), b = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0)
  let current = entPose(species, 0, design)
  let arms = [entArm("left", current.height, 0, design), entArm("right", current.height, 0, design)]
  const segment = (index: number, from: Point3, to: Point3, radius: number) => {
    a.set(...from); b.set(...to).sub(a)
    limbs[index].position.copy(a).addScaledVector(b, .5)
    limbs[index].scale.set(radius, b.length(), radius)
    limbs[index].quaternion.setFromUnitVectors(axis, b.normalize())
  }
  const pose = (phase: number, moving = true) => {
    current = entPose(species, phase, design, moving)
    arms = (["left", "right"] as const).map(side => entArm(side, current.height, phase, design, moving))
    for (const [i, leg] of [current.left, current.right].entries()) {
      const [x, y, z] = leg.ankle
      segment(i * 6, leg.hip, leg.knee, species === "birch" ? .045 : .065)
      segment(i * 6 + 1, leg.knee, leg.ankle, .049)
      segment(i * 6 + 2, leg.hip, [0, current.height + .09, 0], .07)
      for (let toe = 0; toe < 3; toe++) segment(i * 6 + 3 + toe, [x, y, z - .035], [x + (toe - 1) * .065, y - .012, z + .14 - Math.abs(toe - 1) * .025], .022)
      const arm = arms[i], base = 12 + i * 6, sign = i === 0 ? 1 : -1
      segment(base, [0, current.height + .39, 0], arm.shoulder, .05)
      segment(base + 1, arm.shoulder, arm.elbow, .041)
      segment(base + 2, arm.elbow, arm.hand, .032)
      for (let finger = 0; finger < 3; finger++) segment(base + 3 + finger, arm.hand,
        [arm.hand[0] + sign * .035, arm.hand[1] - .08, arm.hand[2] + (finger - 1) * .047], .015)
    }
    return current
  }
  pose(0)
  return { root, pose, joints() {
    return Object.fromEntries((["left", "right"] as const).flatMap((side, i) => {
      const leg = current[side]
      return ([[`${side}Hip`, leg.hip], [`${side}Knee`, leg.knee], [`${side}Foot`, leg.ankle], [`${side}Shoulder`, arms[i].shoulder], [`${side}Elbow`, arms[i].elbow], [`${side}Hand`, arms[i].hand]] as [EntJoint, Point3][])
        .map(([joint, position]) => [joint, { position, editable: !joint.endsWith("Foot") || !leg.planted,
          reason: joint.endsWith("Foot") && leg.planted ? "Planted root: select a swing frame to edit." : undefined }])
    })) as Record<EntJoint, { position: Point3; editable: boolean; reason?: string }>
  }, dispose() { geometry.dispose(); material.dispose() } }
}
