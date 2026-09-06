import * as THREE from "three"
import { personRecipe, type PersonDesign } from "./design"
import { BASE_PERSON, PERSON_CLIPS, type Point3 } from "./pose"
import { createBasePersonRig } from "./rig"
import { woodcuttingProfile } from "./woodcutting"
import type { TreePlacement } from "../trees/placement"

type WorkContacts = Record<"treeFelling" | "woodcutting", Point3>
const contacts = new WeakMap<PersonDesign, WorkContacts>()

/** Sample the authored contact pose once per design, including any edited joints. */
export function workContacts(design: PersonDesign): WorkContacts {
  const cached = contacts.get(design)
  if (cached) return cached
  const rig = createBasePersonRig(personRecipe(design))
  try {
    const frames = PERSON_CLIPS.treeFelling.frames
    rig.pose(Math.ceil(woodcuttingProfile(design).strikeEnd * frames) / frames, "treeFelling")
    const blade = rig.root.getObjectByName("axe-head")!
    const strike = blade.localToWorld(new THREE.Vector3(0, 0, 0.2)).toArray() as Point3
    const log = rig.root.getObjectByName("woodcutting-log")!
    const result = { treeFelling: strike, woodcutting: log.position.toArray() as Point3 }
    contacts.set(design, result)
    return result
  } finally { rig.dispose() }
}

/** Match the atlas's quantized facing and projection, rather than the actor's smooth heading. */
export function workContactOffset(point: Point3, direction: number, yaw: number, pitch: number, rigScale: number) {
  const angle = -direction * Math.PI / 4
  const x = (point[0] * Math.cos(angle) + point[2] * Math.sin(angle)) * rigScale
  const z = (-point[0] * Math.sin(angle) + point[2] * Math.cos(angle)) * rigScale
    * Math.sin(BASE_PERSON.camera.pitch * Math.PI / 180) / Math.sin(Math.atan(pitch))
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) }
}

/** Keep feet on the terrain while the baked contact stays projected onto its world prop. */
export function workContactOrigin(target: { x: number; y: number; z: number }, point: Point3,
  direction: number, yaw: number, pitch: number, rigScale: number, groundAt?: (x: number, z: number) => number) {
  const offset = workContactOffset(point, direction, yaw, pitch, rigScale)
  const baseX = target.x - offset.x, baseZ = target.z - offset.z
  const angle = Math.atan(pitch)
  const heightOffset = point[1] * rigScale * (Math.cos(BASE_PERSON.camera.pitch * Math.PI / 180) - Math.cos(angle)) / Math.sin(angle)
  let x = baseX, z = baseZ
  // The world uses shallow slopes. Solve the ground contact along camera depth,
  // where it can compensate height without changing the contact's screen X.
  for (let i = 0; i < 6; i++) {
    const y = groundAt?.(x, z) ?? target.y
    const depth = (y - target.y) / pitch + heightOffset
    x = baseX + Math.sin(yaw) * depth
    z = baseZ + Math.cos(yaw) * depth
  }
  return { x, y: groundAt?.(x, z) ?? target.y, z }
}

/** A leaning standing trunk is displaced at axe height; the stump stays at its base. */
export function trunkContact(tree: TreePlacement, strikeHeight: number) {
  const lean = tree.shape ? Math.tan(tree.shape.leanAngle) * strikeHeight : 0
  const yaw = tree.shape?.leanYaw ?? 0
  return { x: tree.x + Math.cos(yaw) * lean, y: tree.y, z: tree.z + Math.sin(yaw) * lean }
}
