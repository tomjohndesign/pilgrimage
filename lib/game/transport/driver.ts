import * as THREE from "three"
import { personRecipe, type PersonDesign } from "../base-person/design"
import type { createBasePersonRig } from "../base-person/rig"
import type { Point3 } from "../base-person/pose"
import { CART, DRIVER_SEAT } from "./assets"

export const DRIVER_HIP = 0.65
export const DRIVER_GRIP = { x: 0.23, y: DRIVER_HIP + 0.3, z: 0.44 } as const
export const DRIVER_CLIP = { variants: 6, directions: CART.directions, cellSize: CART.cellSize, anchor: CART.anchor } as const

/** Seat-relative rig coordinates rotate with the displayed cart frame. */
export function driverPoint(point: Point3, heading: number): Point3 {
  const x = DRIVER_SEAT.x + point[0], z = DRIVER_SEAT.z + point[2]
  return [x * Math.cos(heading) + z * Math.sin(heading), DRIVER_SEAT.y + point[1], -x * Math.sin(heading) + z * Math.cos(heading)]
}

/** A transport-only pose on the shared person meshes. Thighs extend over the
 * bench, knees sit below the hips, and shins hang vertically. Bone lengths,
 * outfits and the walking rig are retained. Call after the rig's idle pose. */
export function poseDriver(rig: ReturnType<typeof createBasePersonRig>, design: PersonDesign, driving = true) {
  const b = personRecipe(design).body, root = rig.root
  const pelvis = root.getObjectByName("pelvis")!
  pelvis.position.y = DRIVER_HIP
  pelvis.rotation.set(0, 0, 0)
  const bone = (name: string, a: THREE.Vector3, c: THREE.Vector3) => {
    const mesh = root.getObjectByName(name)! as THREE.Mesh
    mesh.position.copy(a).add(c).multiplyScalar(0.5)
    mesh.scale.y = a.distanceTo(c)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(c).normalize())
  }
  // Fold the existing garment over the lap instead of bunching it at the knees.
  const torso = root.getObjectByName("shirt") ?? root.getObjectByName("sleeveless-dress") ?? root.getObjectByName("robe")
  if (torso instanceof THREE.Mesh) {
    const positions = torso.geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i), weight = Math.max(0, Math.min(1, (b.hipHeight + 0.04 - y) / 0.3))
      positions.setY(i, Math.max(y, b.hipHeight - 0.09))
      positions.setZ(i, positions.getZ(i) + b.thighLength * weight / torso.scale.z)
    }
    positions.needsUpdate = true; torso.geometry.computeVertexNormals()
  }
  root.updateMatrixWorld(true)
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? 1 : -1, x = sign * b.legOffset
    const hip = new THREE.Vector3(x, DRIVER_HIP, 0)
    const knee = new THREE.Vector3(x, DRIVER_HIP - 0.05, Math.sqrt(b.thighLength ** 2 - 0.05 ** 2))
    const ankle = knee.clone().add(new THREE.Vector3(0, -b.shinLength, 0))
    const leg = design.bodyType === "Female" ? "leg" : "trouser"
    bone(`${side}-${leg}-upper`, hip, knee); bone(`${side}-${leg}-lower`, knee, ankle)
    const foot = root.getObjectByName(`${side}-foot`)!
    foot.position.set(ankle.x, ankle.y - b.ankleHeight + b.footHeight / 2, ankle.z + b.footLength * 0.22)
    foot.rotation.set(0, 0, 0)
    // The normal standing hem clip would hide the seated thighs. The same
    // plane is shared by the ink mask, keeping the two passes registered.
    for (const name of [`${side}-${leg}-upper`, `${side}-${leg}-lower`]) {
      const mesh = root.getObjectByName(name)! as THREE.Mesh
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.clippingPlanes?.forEach(plane => { plane.normal.set(0, -1, 0); plane.constant = 10 })
      }
    }
    const shoulder = root.getObjectByName(`${side}-shoulder`)!, elbow = root.getObjectByName(`${side}-elbow`)!
    const target = driving ? new THREE.Vector3(sign * DRIVER_GRIP.x, DRIVER_GRIP.y, DRIVER_GRIP.z) : new THREE.Vector3(sign*.18,DRIVER_HIP+.13,.3)
    shoulder.parent!.worldToLocal(root.localToWorld(target))
    const start = shoulder.position.clone(), axis = target.clone().sub(start), length = axis.length()
    const lower = b.forearmLength + 0.04 * design.hands
    if (length >= b.upperArmLength + lower) throw new Error(`Driver cannot reach the reins (${side}).`)
    axis.normalize()
    const along = (b.upperArmLength ** 2 - lower ** 2 + length ** 2) / (2 * length)
    const bend = new THREE.Vector3(sign, -1, 0); bend.addScaledVector(axis, -bend.dot(axis)).normalize()
    const joint = start.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(b.upperArmLength ** 2 - along ** 2))
    shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), joint.clone().sub(start).normalize())
    elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.sub(joint).normalize().applyQuaternion(shoulder.quaternion.clone().invert()))
  }
  root.updateMatrixWorld(true)
}

/** A slack leather rein between the actual hands and bridle; endpoints stay
 * attached as the animal changes heading relative to the cart. */
export function reinPoints(hand: Point3, bit: Point3): Point3[] {
  return Array.from({ length: 13 }, (_, i) => {
    const t = i / 12
    return [hand[0] + (bit[0] - hand[0]) * t, hand[1] + (bit[1] - hand[1]) * t - Math.sin(t * Math.PI) * 0.09,
      hand[2] + (bit[2] - hand[2]) * t]
  })
}
