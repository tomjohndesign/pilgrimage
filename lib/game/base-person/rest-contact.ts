import * as THREE from "three"
import { personRecipe, type PersonDesign } from "./design"
import { BASE_PERSON, type Point3 } from "./pose"
import { createBasePersonRig } from "./rig"

type RestClip = "sitting" | "sleeping" | "seatedPrayer"
const contacts = new WeakMap<PersonDesign, Map<string, Point3[]>>()

/** Register the outfit's underside, including proportions and saved pose edits. */
export function restContacts(design: PersonDesign, clip: RestClip, frames: number): Point3[] {
  let cached = contacts.get(design)
  if (!cached) { cached = new Map(); contacts.set(design, cached) }
  const key = `${clip}:${frames}`
  const existing = cached.get(key)
  if (existing) return existing
  const rig = createBasePersonRig(personRecipe(design))
  try {
    const torso = rig.root.getObjectByName(design.garment === "Robe" ? "robe" : design.bodyType === "Female" ? "sleeveless-dress" : "shirt") as THREE.Mesh
    const pelvis = rig.root.getObjectByName("pelvis")!
    const body = [torso, ...["head-shape", "left-foot", "right-foot"].map(name => rig.root.getObjectByName(name)!)]
    const point = new THREE.Vector3(), bounds = new THREE.Box3()
    const result = Array.from({ length: frames }, (_, frame): Point3 => {
      rig.pose(frame / frames, clip)
      rig.root.updateMatrixWorld(true)
      // The hem/back rests on the top. Feet, hands, pillows and snore marks
      // must not lower this contact or shift a seat away from the hips.
      bounds.setFromObject(torso, true)
      const height = bounds.min.y
      if (clip === "sleeping") {
        // Centre head to toe on the mattress. Accessories, breathing hands,
        // the ground pillow and effects do not move the body's resting place.
        bounds.makeEmpty()
        for (const part of body) bounds.expandByObject(part, true)
        bounds.getCenter(point)
      } else pelvis.getWorldPosition(point)
      return [point.x, height, point.z]
    })
    cached.set(key, result)
    return result
  } finally { rig.dispose() }
}

/** Undo the baked camera projection, then register color and depth at the live pitch. */
export function restContactOrigin(target: { x: number; y: number; z: number }, point: Point3,
  direction: number, yaw: number, pitch: number, scale: number) {
  const facing = -direction * Math.PI / 4
  const x = (point[0] * Math.cos(facing) + point[2] * Math.sin(facing)) * scale
  const z = (-point[0] * Math.sin(facing) + point[2] * Math.cos(facing)) * scale
  const y = point[1] * scale
  const tilt = Math.atan(pitch) - BASE_PERSON.camera.pitch * Math.PI / 180
  const depth = z * Math.cos(tilt) - y * Math.sin(tilt)
  return { x: target.x - x * Math.cos(yaw) - depth * Math.sin(yaw),
    y: target.y - y * Math.cos(tilt) - z * Math.sin(tilt),
    z: target.z + x * Math.sin(yaw) - depth * Math.cos(yaw) }
}
