import { uncoverHead } from "../base-person/head-covering"
import type { BaseClip } from "../base-person/pose"
import * as THREE from "three"
import { createBasePersonRig } from "../base-person/rig"
import { personRecipe } from "../base-person/design"
import { model, type Point } from "../transport/geometry"
import { spinePoint } from "../transport/animal-pose"
import { knightDesign } from "./design"

/** Equipment attaches to the shared moving head and pelvis; no walking pose changes. */
export function equipKnight(rig: ReturnType<typeof createBasePersonRig>, variant = 0) {
  const m = model(), recipe = personRecipe(knightDesign(variant)), b = recipe.body
  const head = rig.root.getObjectByName("head-pivot")!, face = rig.root.getObjectByName("head-shape")!
  const helmet = new THREE.Group(); helmet.name = "nasal-helmet"; head.add(helmet)
  helmet.position.y = face.position.y
  const steel = "#858c8d", edge = "#42494b"
  const cap = m.mesh(new THREE.ConeGeometry(b.headWidth * 1.09, 0.26, 10), steel, [0, b.headHeight * 0.8 + 0.08, 0], helmet)
  cap.scale.z = 0.9
  const rim = m.mesh(new THREE.CylinderGeometry(b.headWidth * 1.09, b.headWidth * 1.09, 0.045, 12), edge, [0, b.headHeight * 0.8 - 0.045, 0], helmet)
  rim.scale.z = 0.9
  m.box([0, b.headHeight * 0.22, b.headDepth + 0.023], [0.045, 0.23, 0.035], steel, helmet)
  // Open-faced mail coif, visible at the cheeks and nape.
  const coif = m.mesh(new THREE.CylinderGeometry(b.headWidth * 1.03, b.headWidth * 1.08, b.headHeight * 1.6, 12, 1, true, Math.PI * 0.32, Math.PI * 1.36), "#626a6d", [0, -0.055, 0], helmet)
  coif.scale.z = 0.91
  const sword = new THREE.Group(); sword.name = "sheathed-sword"; rig.sockets.leftHip.add(sword)
  sword.rotation.z = -0.15; sword.rotation.x = -0.18
  m.box([0.035, -0.21, 0], [0.07, 0.65, 0.07], "#453525", sword)
  m.box([0.035, 0.15, 0], [0.21, 0.045, 0.055], edge, sword)
  m.box([0.035, 0.23, 0], [0.05, 0.13, 0.05], "#65482f", sword)
  m.oval([0.035, 0.31, 0], [0.055, 0.045, 0.035], steel, sword)
  // A small repeating linked-mail texture stays at the established native pixel density.
  const pixels = new Uint8Array([104,113,116,255, 139,146,148,255, 139,146,148,255, 104,113,116,255])
  const mail = new THREE.DataTexture(pixels, 2, 2); mail.colorSpace = THREE.SRGBColorSpace
  mail.magFilter = mail.minFilter = THREE.NearestFilter; mail.wrapS = mail.wrapT = THREE.RepeatWrapping
  mail.repeat.set(12, 12); mail.needsUpdate = true
  for (const name of ["shirt", "left-upper-sleeve", "right-upper-sleeve", "left-lower-sleeve", "right-lower-sleeve"]) {
    const part = rig.root.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
    if (part) { part.material.map = mail; part.material.needsUpdate = true }
  }
  return { pose(clip: BaseClip) { helmet.visible = !uncoverHead(recipe.design.bodyType, clip) }, dispose() { m.root.add(helmet, sword); m.dispose(); mail.dispose() } }
}

/** Raised wooden saddle bows, wool pad, girth, bridle, reins and iron stirrups. */
export function createRidingTack(horse: THREE.Group) {
  const m = model(), saddle = new THREE.Group(); saddle.name = "riding-saddle"; horse.add(saddle)
  // A short wool saddlecloth follows the barrel, with a plain woven border.
  // Its hem clears the knees; this is not a later full-body heraldic caparison.
  const drape = [[-0.47, -0.56], [-0.46, -0.32], [-0.32, -0.10], [0, -0.025], [0.32, -0.10], [0.46, -0.32], [0.47, -0.56]]
  function cloth(from: number, to: number, color: string, raised = 0) {
    const vertices = drape.flatMap(([x, y]) => [x, y + raised, from, x, y + raised, to]), indices: number[] = []
    for (let i = 0; i < drape.length - 1; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
    const mesh = m.mesh(geometry, color, [0, 0, 0], saddle)
    mesh.name = "wool-saddlecloth"; mesh.material.side = THREE.DoubleSide
  }
  cloth(-0.59, 0.48, "#973e38")
  cloth(-0.55, -0.495, "#c4a578", 0.006)
  cloth(0.385, 0.44, "#c4a578", 0.006)
  m.box([0, 0.025, 0], [0.57, 0.11, 0.64], "#60432c", saddle)
  for (const z of [-0.33, 0.33]) m.mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.075, 12, 1, false, 0, Math.PI), "#765337", [0, 0.12, z], saddle).rotation.x = Math.PI / 2
  for (const sign of [-1, 1]) {
    m.bar([sign * 0.43, 0, 0], [sign * 0.43, -0.64, 0], 0.035, "#453525", saddle)
    m.bar([sign * 0.29, 0.04, 0.14], [sign * 0.54, -0.55, 0.23], 0.025, "#453525", saddle)
    const stirrup = m.mesh(new THREE.TorusGeometry(0.075, 0.018, 4, 8), "#525859", [sign * 0.54, -0.57, 0.23], saddle); stirrup.rotation.y = Math.PI / 2
  }
  m.bar([-0.43, -0.64, 0], [0.43, -0.64, 0], 0.04, "#453525", saddle)
  const head = horse.getObjectByName("articulated-head")!, bridle = new THREE.Group(); head.add(bridle)
  for (const sign of [-1, 1]) {
    m.bar([sign * 0.13, 0.04, -0.03], [sign * 0.15, -0.43, 0.39], 0.023, "#453525", bridle)
    m.bar([sign * 0.15, -0.43, 0.39], [sign * 0.14, -0.47, 0.49], 0.026, "#453525", bridle)
  }
  m.bar([-0.15, -0.43, 0.39], [0.15, -0.43, 0.39], 0.025, "#453525", bridle)
  const reins = [-1, 1].map(() => m.bar([0, 0, 0], [0, 1, 0], 0.017, "#453525", horse))
  return { saddle, pose(phase: number, moving: boolean, hands?: Point[]) {
    saddle.position.set(...spinePoint([0, 1.77, -0.08], "horse", phase, moving, "noble"))
    horse.updateMatrixWorld(true)
    reins.forEach((rein, i) => {
      const sign = i ? 1 : -1
      const a = horse.worldToLocal(head.localToWorld(new THREE.Vector3(sign * 0.15, -0.43, 0.39)))
      const b = hands ? new THREE.Vector3(...hands[i]) : saddle.position.clone().add(new THREE.Vector3(sign * 0.2, 0.1, 0))
      rein.position.copy(a).lerp(b, 0.5)
      rein.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
      rein.scale.y = a.distanceTo(b)
    })
  }, dispose() { m.root.add(saddle, bridle, ...reins); m.dispose() } }
}

/** Riding is a seated pose layered on the same person; walking remains untouched. */
export function seatKnight(rig: ReturnType<typeof createBasePersonRig>, variant: number, phase: number, moving: boolean) {
  const b = personRecipe(knightDesign(variant)).body
  rig.pose(0, "idle")
  const seat = spinePoint([0, 1.89, -0.08], "horse", phase, moving, "noble")
  const pelvis = rig.root.getObjectByName("pelvis")!
  pelvis.position.set(...seat)
  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? 1 : -1
    const hip = new THREE.Vector3(sign * b.legOffset, seat[1], seat[2])
    const knee = hip.clone().add(new THREE.Vector3(sign * 0.27, -0.18, 0.17).normalize().multiplyScalar(b.thighLength))
    const ankle = knee.clone().add(new THREE.Vector3(sign * 0.025, -1, -0.13).normalize().multiplyScalar(b.shinLength))
    for (const [part, a, z] of [["upper", hip, knee], ["lower", knee, ankle]] as const) {
      const limb = rig.root.getObjectByName(`${side}-trouser-${part}`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
      limb.material.clippingPlanes = null
      limb.position.copy(a).lerp(z, 0.5); limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(z).normalize())
    }
    const foot = rig.root.getObjectByName(`${side}-foot`)!
    foot.position.copy(ankle); foot.rotation.set(0, 0, 0)
    const shoulder = rig.root.getObjectByName(`${side}-shoulder`)!, elbow = rig.root.getObjectByName(`${side}-elbow`)!
    shoulder.rotation.set(-0.5, 0, sign * 0.08); elbow.rotation.set(-0.85, 0, 0)
  }
  rig.root.updateMatrixWorld(true)
}
