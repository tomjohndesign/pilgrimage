import * as THREE from "three"
import { uncoverHead } from "./head-covering"
import type { PersonRecipe } from "./design"
import type { BaseClip, SocketName } from "./pose"
import { staffDimensions, staffMotion } from "./staff-motion"
import type { PoseEdits } from "./pose-edits"

/** Socket-mounted equipment is baked with the person for all eight views. */
export function createRoadAccessories(recipe: PersonRecipe, sockets: Record<SocketName, THREE.Object3D>, root: THREE.Object3D) {
  const { design, body: b } = recipe
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const material = (color: string) => {
    const result = new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.push(result)
    return result
  }
  const wood = material("#785637"), dark = material("#503b2b")
  const cloth = material(design.tunicColor), wool = material(design.coveringColor), pale = material("#d6b57b")
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
  if (design.hat === "Wool cap" || design.hat === "Cloth cap") {
    // Close-fitting cloth crown with a folded hem: no projecting brim, band or feather.
    const cap = mesh(hat, new THREE.LatheGeometry([
      new THREE.Vector2(b.headWidth * 1.16, -0.16),
      new THREE.Vector2(b.headWidth * 1.20, -0.12),
      new THREE.Vector2(b.headWidth * 1.14, -0.08),
      new THREE.Vector2(b.headWidth * 1.03, 0.015),
      new THREE.Vector2(b.headWidth * 0.66, 0.085),
      new THREE.Vector2(0, 0.11),
    ], 12), design.hat === "Cloth cap" ? cloth : wool)
    cap.name = "cloth-cap"; cap.scale.z = b.headDepth / b.headWidth * 1.04
  }
  const satchel = group("road-satchel", "leftHip")
  if (design.satchel) {
    const pouch = mesh(satchel, new THREE.SphereGeometry(1, 8, 6), wood, 0.10, 0.01, 0.025)
    pouch.scale.set(0.13, 0.16, 0.09)
    mesh(satchel, new THREE.BoxGeometry(0.23, 0.10, 0.025), dark, 0.10, 0.10, 0.115)
    strap(satchel, [[0.10, 0.11, 0.135], [0.10, 0.045, 0.14], [0.13, 0.015, 0.13]])
    const rise = b.torsoShoulderHeight - b.hipHeight
    strap(satchel, [[0.1, 0.13, 0.07], [-b.torsoBottom * 0.6, rise * 0.5, b.torsoTop * 0.82],
      [-b.torsoBottom - b.torsoTop * 0.65, rise, 0], [-b.torsoBottom * 0.6, rise * 0.5, -b.torsoTop * 0.83], [0.1, 0.13, -0.05]])
  }
  const lute = group("road-lute", "back")
  if (design.lute) {
    lute.position.set(0.04, -0.20, -0.12); lute.rotation.z = -0.50
    // Short-necked lute: one pear-shaped soundboard, a deep bowl and swept-back pegbox.
    // Reference: https://www.metmuseum.org/essays/the-lute
    const outline = new THREE.Shape()
    outline.moveTo(0, -0.29)
    outline.bezierCurveTo(-0.33, -0.29, -0.32, -0.02, -0.20, 0.15)
    outline.bezierCurveTo(-0.14, 0.24, -0.065, 0.29, -0.045, 0.31)
    outline.lineTo(0.045, 0.31)
    outline.bezierCurveTo(0.065, 0.29, 0.14, 0.24, 0.20, 0.15)
    outline.bezierCurveTo(0.32, -0.02, 0.33, -0.29, 0, -0.29)
    const bowl = mesh(lute, new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.29), new THREE.Vector2(0.18, -0.25),
      new THREE.Vector2(0.265, -0.12), new THREE.Vector2(0.265, -0.015),
      new THREE.Vector2(0.20, 0.15), new THREE.Vector2(0.10, 0.26),
      new THREE.Vector2(0.045, 0.31), new THREE.Vector2(0, 0.31),
    ], 12, -Math.PI / 2, Math.PI), wood)
    bowl.name = "lute-bowl"; bowl.scale.z = 0.8
    mesh(lute, new THREE.ShapeGeometry(outline, 6), pale, 0, 0, -0.005).rotation.y = Math.PI
    mesh(lute, new THREE.CylinderGeometry(0.065, 0.065, 0.012, 10), dark, 0, 0.03, -0.018).rotation.x = Math.PI / 2
    mesh(lute, new THREE.BoxGeometry(0.085, 0.27, 0.055), dark, 0, 0.425, 0.02)
    const pegbox = new THREE.Group(); pegbox.name = "lute-pegbox"
    pegbox.position.set(0, 0.56, 0.02); pegbox.rotation.x = 1.15; lute.add(pegbox)
    mesh(pegbox, new THREE.BoxGeometry(0.10, 0.18, 0.055), wood, 0, 0.075)
    mesh(lute, new THREE.BoxGeometry(0.14, 0.035, 0.015), dark, 0, -0.15, -0.022)
    mesh(lute, new THREE.BoxGeometry(0.018, 0.70, 0.01), pale, 0, 0.20, -0.03)
    for (const x of [-0.065, 0.065]) for (const y of [0.035, 0.08, 0.125])
      mesh(pegbox, new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6), dark, x, y).rotation.z = Math.PI / 2
    strap(lute, [[-0.08, 0.22, 0.06], [-0.25, 0.32, 0.27], [-0.39, 0.03, 0.30], [-0.20, -0.20, 0.10]])
  }
  const staff = group("walking-staff", "rightHand")
  if (design.walkingStick) {
    const { length, gripHeight } = staffDimensions(b)
    const crook = design.handTool === "Shepherd crook", bend = 0.14
    const shaftLength = crook ? length - bend : length
    mesh(staff, new THREE.CylinderGeometry(0.038, 0.040, shaftLength, 8), wood, 0, shaftLength / 2 - gripHeight)
    if (crook) {
      // A continuous bent wooden head, kept inside the original staff's height.
      const top = shaftLength - gripHeight
      const hook = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, top, 0), new THREE.Vector3(0.035, top + .10, 0),
        new THREE.Vector3(bend, top + bend, 0), new THREE.Vector3(.245, top + .10, 0),
        new THREE.Vector3(.28, top, 0), new THREE.Vector3(.25, top - .11, 0),
      ])
      mesh(staff, new THREE.TubeGeometry(hook, 16, .038, 6, false), wood).name = "shepherd-crook"
    } else mesh(staff, new THREE.SphereGeometry(0.041, 6, 4), wood, 0, length - gripHeight)
    // Keep the shaft a fine wooden line rather than inflating it with edge ink.
    staff.children.forEach(part => { part.userData.inkPart = 11 })
  }
  return {
    pose(clip: BaseClip, phase: number, edits: PoseEdits | undefined = design.poseEdits) {
      const road = clip === "walk" || clip === "idle"
      hat.visible = clip !== "sleeping" && !uncoverHead(design.bodyType, clip)
      satchel.visible = road && design.satchel
      lute.visible = road && design.lute
      staff.visible = road && design.walkingStick
      if (staff.visible) {
        const { tip, planted } = staffMotion(phase, b, clip === "walk", edits)
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
