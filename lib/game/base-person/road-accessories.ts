import * as THREE from "three"
import type { PersonRecipe } from "./design"
import type { BaseClip, SocketName } from "./pose"
import { staffDimensions, staffMotion } from "./staff-motion"

/** Socket-mounted equipment is baked with the person for all eight views. */
export function createRoadAccessories(recipe: PersonRecipe, sockets: Record<SocketName, THREE.Object3D>, root: THREE.Object3D) {
  const { design, body: b } = recipe
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const material = (color: string) => {
    const result = new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.push(result)
    return result
  }
  const wood = material("#785637"), dark = material("#503b2b"), gold = material(design.accentColor)
  const cloth = material(design.tunicColor), pale = material("#d6b57b")
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
    x = 0, y = 0, z = 0) => {
    geometries.push(geometry)
    const result = new THREE.Mesh(geometry, mat)
    result.position.set(x, y, z); result.userData.inkPart = 5; parent.add(result)
    return result
  }
  const group = (name: string, socket: SocketName) => {
    const result = new THREE.Group(); result.name = name; sockets[socket].add(result)
    return result
  }
  const strap = (parent: THREE.Object3D, points: number[][]) => mesh(parent,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 16, 0.025, 4, false), dark)
  const hat = group("road-hat", "head")
  if (design.hat === "Travel hat" || design.hat === "Minstrel hat") {
    const minstrel = design.hat === "Minstrel hat"
    const brim = mesh(hat, new THREE.CylinderGeometry(b.headWidth * 1.65, b.headWidth * 1.65, 0.035, 10), minstrel ? cloth : pale, 0, -0.10)
    brim.scale.z = 0.87
    const crown = mesh(hat, new THREE.CylinderGeometry(minstrel ? 0.02 : b.headWidth * 0.72, b.headWidth * 1.07, minstrel ? 0.23 : 0.17, 8), minstrel ? cloth : pale, minstrel ? -0.055 : 0, 0.005)
    crown.rotation.z = minstrel ? 0.4 : 0
    mesh(hat, new THREE.CylinderGeometry(b.headWidth * 1.07, b.headWidth * 1.1, 0.04, 10), minstrel ? gold : dark, 0, -0.055).scale.z = 0.94
    if (minstrel) {
      const feather = mesh(hat, new THREE.SphereGeometry(1, 6, 4), gold, b.headWidth * 0.9, 0.15, -0.015)
      feather.name = "hat-feather"; feather.scale.set(0.045, 0.18, 0.022); feather.rotation.z = -0.5
    }
  }
  const satchel = group("road-satchel", "leftHip")
  if (design.satchel) {
    mesh(satchel, new THREE.BoxGeometry(0.21, 0.25, 0.16), wood, 0.10, 0.01, 0.025)
    mesh(satchel, new THREE.BoxGeometry(0.23, 0.10, 0.025), dark, 0.10, 0.10, 0.115)
    mesh(satchel, new THREE.BoxGeometry(0.035, 0.055, 0.025), pale, 0.10, 0.075, 0.135)
    const rise = b.torsoShoulderHeight - b.hipHeight
    strap(satchel, [[0.1, 0.13, 0.07], [-b.torsoBottom * 0.6, rise * 0.5, b.torsoTop * 0.82],
      [-b.torsoBottom - b.torsoTop * 0.65, rise, 0], [-b.torsoBottom * 0.6, rise * 0.5, -b.torsoTop * 0.83], [0.1, 0.13, -0.05]])
  }
  const guitar = group("road-guitar", "back")
  if (design.guitar) {
    guitar.position.set(0.04, -0.20, -0.12); guitar.rotation.z = -0.50
    // An hourglass soundbox, separate neck, sound hole and bridge read at native pixels.
    const outline = new THREE.Shape()
    outline.moveTo(0, -0.29)
    outline.bezierCurveTo(-0.28, -0.29, -0.25, -0.04, -0.14, 0.015)
    outline.bezierCurveTo(-0.25, 0.22, -0.09, 0.26, 0, 0.23)
    outline.bezierCurveTo(0.09, 0.26, 0.25, 0.22, 0.14, 0.015)
    outline.bezierCurveTo(0.25, -0.04, 0.28, -0.29, 0, -0.29)
    mesh(guitar, new THREE.ExtrudeGeometry(outline, { depth: 0.10, bevelEnabled: false, curveSegments: 4 }), wood)
    mesh(guitar, new THREE.ShapeGeometry(outline, 4), pale, 0, 0, -0.005).rotation.y = Math.PI
    mesh(guitar, new THREE.CylinderGeometry(0.065, 0.065, 0.012, 10), dark, 0, 0.03, -0.018).rotation.x = Math.PI / 2
    mesh(guitar, new THREE.BoxGeometry(0.075, 0.48, 0.055), dark, 0, 0.42, 0.02)
    mesh(guitar, new THREE.BoxGeometry(0.115, 0.12, 0.07), wood, 0, 0.70, 0.02)
    mesh(guitar, new THREE.BoxGeometry(0.14, 0.035, 0.015), dark, 0, -0.15, -0.022)
    mesh(guitar, new THREE.BoxGeometry(0.018, 0.72, 0.01), pale, 0, 0.22, -0.03)
    for (const x of [-0.075, 0.075]) for (const y of [0.67, 0.73]) mesh(guitar, new THREE.BoxGeometry(0.045, 0.025, 0.035), pale, x, y, 0.02)
  }
  const staff = group("walking-staff", "rightHand")
  if (design.walkingStick) {
    const { length, gripHeight } = staffDimensions(b)
    mesh(staff, new THREE.CylinderGeometry(0.038, 0.040, length, 8), wood, 0, length / 2 - gripHeight)
    mesh(staff, new THREE.SphereGeometry(0.041, 6, 4), wood, 0, length - gripHeight)
    // Keep the shaft a fine wooden line rather than inflating it with edge ink.
    staff.children.forEach(part => { part.userData.inkPart = 11 })
  }
  return {
    pose(clip: BaseClip, phase: number) {
      const road = clip === "walk" || clip === "idle"
      hat.visible = clip !== "sleeping"
      satchel.visible = road && design.satchel
      guitar.visible = road && design.guitar
      staff.visible = road && design.walkingStick
      if (staff.visible) {
        const { tip, planted } = staffMotion(phase, b, clip === "walk", design.poseEdits)
        const grip = root.worldToLocal(sockets.rightHand.getWorldPosition(new THREE.Vector3()))
        const axis = grip.clone().sub(new THREE.Vector3(...tip))
        const gripDistance = axis.length()
        axis.normalize()
        const desired = root.getWorldQuaternion(new THREE.Quaternion()).multiply(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis))
        const orientation = sockets.rightHand.getWorldQuaternion(new THREE.Quaternion())
        staff.quaternion.copy(orientation.invert().multiply(desired))
        staff.position.set(0, staffDimensions(b).gripHeight - gripDistance, 0).applyQuaternion(staff.quaternion)
        staff.userData.planted = planted
      }
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) },
  }
}
