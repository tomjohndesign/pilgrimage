import * as THREE from "three"
import type { createBasePersonRig } from "../base-person/rig"
import { model } from "../transport/geometry"

export const SQUIRE_PALETTE = ["#973e38", "#c4a578", "#667a7d", "#45575a", "#858c8d"]

/** A Norman kite shield, rolled wool cloak and the existing leather supply satchel.
 * Shield reference: https://www.english-heritage.org.uk/learn/histories/1066-and-the-norman-conquest/the-weaponry-of-1066/
 * Carrying changes the loaded arm only; shared leg joints and ground contacts remain intact.
 */
export function equipSquire(rig: ReturnType<typeof createBasePersonRig>) {
  const m = model(), shield = new THREE.Group(), roll = new THREE.Group()
  shield.name = "carried-kite-shield"; rig.sockets.leftHand.add(shield)
  roll.name = "rolled-wool-cloak"; rig.sockets.back.add(roll)
  const outline = new THREE.Shape()
  outline.moveTo(0, 0.34)
  outline.bezierCurveTo(-0.29, 0.34, -0.31, 0.11, -0.24, -0.12)
  outline.lineTo(0, -0.65); outline.lineTo(0.24, -0.12)
  outline.bezierCurveTo(0.31, 0.11, 0.29, 0.34, 0, 0.34)
  const board = m.mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.04, bevelEnabled: false, curveSegments: 5 }), "#60432c", [0, 0, 0.055], shield)
  board.name = "wooden-shield-board"
  m.mesh(new THREE.ShapeGeometry(outline, 5), "#973e38", [0, 0, 0.096], shield).scale.set(0.94, 0.94, 1)
  // Plain painted band and iron boss, without later heraldic quartering.
  m.box([0, -0.12, 0.10], [0.05, 0.83, 0.01], "#c4a578", shield)
  const boss = m.mesh(new THREE.SphereGeometry(0.08, 8, 6), "#858c8d", [0, 0.04, 0.11], shield)
  boss.scale.z = 0.5
  for (const x of [-0.09, 0.09]) m.bar([x, -0.12, 0.035], [x, 0.13, 0.035], 0.024, "#453525", shield)

  const cloak = m.mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.67, 10), "#667a7d", [0, 0.12, -0.19], roll)
  cloak.rotation.z = Math.PI / 2
  for (const x of [-0.21, 0.21]) {
    const tie = m.mesh(new THREE.TorusGeometry(0.153, 0.022, 4, 10), "#453525", [x, 0.12, -0.19], roll)
    tie.rotation.y = Math.PI / 2
    const strap = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.1, -0.21), new THREE.Vector3(x, 0.33, 0.05),
      new THREE.Vector3(x, 0.15, 0.40), new THREE.Vector3(x, -0.27, 0.32),
      new THREE.Vector3(x, -0.20, -0.15), new THREE.Vector3(x, 0.1, -0.21),
    ])
    m.mesh(new THREE.TubeGeometry(strap, 18, 0.022, 4, false), "#453525", [0, 0, 0], roll)
  }
  for (const radius of [0.055, 0.105]) {
    const fold = m.mesh(new THREE.TorusGeometry(radius, 0.012, 4, 10), "#45575a", [0.338, 0.12, -0.19], roll)
    fold.rotation.y = Math.PI / 2
  }
  // Put provisions on the free side, clear of the shield and swinging legs.
  const satchel = rig.root.getObjectByName("road-satchel")!
  const originalParent = satchel.parent!
  rig.sockets.rightHip.add(satchel); satchel.scale.x = -1
  satchel.name = "squire-supply-satchel"
  const shoulder = rig.root.getObjectByName("left-shoulder")!, elbow = rig.root.getObjectByName("left-elbow")!
  return { pose() {
    shoulder.rotation.set(-0.12, 0, 0.10); elbow.rotation.set(-0.85, 0, 0)
    rig.root.updateMatrixWorld(true)
    // Keep the shield upright around its hand grip through chest sway and turns.
    const desired = rig.root.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -0.08)))
    shield.quaternion.copy(rig.sockets.leftHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired))
    rig.root.updateMatrixWorld(true)
  }, dispose() {
    originalParent.add(satchel); satchel.scale.x = 1; satchel.name = "road-satchel"
    m.root.add(shield, roll); m.dispose()
  } }
}
