import { animalOffset, type AnimalRigEdits, type AnimalClip, type AnimalJoint } from "../wildlife/rig-edits"
import { animalCoat } from "./coats"
import * as THREE from "three"
import { animalProfile, type Animal, type HorseVariant } from "./assets"
import { animalLeg, animalMotion, spinePoint } from "./animal-pose"
import { model, loft, type CrossSection, type Point } from "./geometry"

/** A shaped rib cage and pelvis, articulated neck/jaw, and four equine limb chains. */
export function createAnimalRig(kind: Animal, variant: HorseVariant = "common", coatId?: string, hitched = false) {
  const m = model(), donkey = kind === "donkey", noble = !donkey && variant === "noble", common = !donkey && !noble
  const profile = animalProfile(kind, variant), h = profile.legHeight, length = donkey ? 0.9 : 1.05
  const { coat, light, dark, belly, muzzle, points, stripe } = animalCoat(kind, coatId)
  const skin: Array<{ geometry: THREE.BufferGeometry; bind: Float32Array }> = []
  function bodyPart(sections: CrossSection[], color: string, name: string) {
    const geometry = loft(sections), mesh = m.mesh(geometry, color, [0, 0, 0]); mesh.name = name
    skin.push({ geometry, bind: new Float32Array(geometry.attributes.position.array) }); return mesh
  }
  // Hand-shaped rings: croup, loin, rib cage, withers and deep breast. Upper and
  // lower contours are independent; there is no ellipsoid torso or sphere head.
  const breadth = noble ? 0.42 : donkey ? 0.31 : 0.32
  const rings = [
    [-1.04, 0.075, 0.25, 0.10], [-0.88, breadth * 0.88, noble ? 0.53 : 0.42, 0.23],
    [-0.62, breadth, noble ? 0.52 : 0.38, 0.27], [-0.33, breadth * (common ? 0.83 : 0.98), common ? 0.29 : 0.37, common ? 0.18 : 0.29],
    [0, breadth, common ? 0.27 : 0.36, noble ? 0.35 : 0.29], [0.34, breadth * 0.96, noble ? 0.45 : 0.35, 0.29],
    [0.59, breadth * 0.86, noble ? 0.62 : donkey ? 0.43 : 0.5, 0.25], [0.78, breadth * 0.7, noble ? 0.49 : 0.33, 0.23], [0.94, 0.10, 0.2, 0.09],
  ]
  bodyPart(rings.map(([z, width, top, bottom]) => ({ at: [0, h + 0.11, z * length], width, top, bottom })), coat, "ribcage-and-pelvis")
  bodyPart([
    { at: [0, h - 0.05, -0.45 * length], width: breadth * 0.68, top: 0.025, bottom: 0.06 },
    { at: [0, h - 0.14, 0.05], width: breadth * 0.81, top: 0.025, bottom: 0.08 },
    { at: [0, h - 0.10, 0.48], width: breadth * 0.6, top: 0.025, bottom: 0.06 },
  ], belly, "belly-plane")
  // Scapula and haunch planes overlap the barrel, giving the limbs muscular roots.
  for (const sign of [-1, 1]) {
    bodyPart([
      { at: [sign * breadth * 0.64, h + 0.34, 0.30], width: 0.055, top: 0.11, bottom: 0.08 },
      { at: [sign * breadth * 0.72, h + 0.2, 0.53], width: noble ? 0.19 : 0.12, top: 0.24, bottom: 0.20 },
      { at: [sign * profile.legSpread, h - 0.12, 0.66], width: noble ? 0.13 : 0.085, top: 0.08, bottom: 0.10 },
    ], coat, "scapula")
    bodyPart([
      { at: [sign * breadth * 0.65, h + 0.2, -0.94 * length], width: noble ? 0.12 : 0.065, top: 0.23, bottom: 0.16 },
      { at: [sign * breadth * 0.77, h + 0.09, -0.73 * length], width: noble ? 0.20 : 0.10, top: 0.29, bottom: 0.20 },
      { at: [sign * profile.legSpread, h - 0.18, -0.46 * length], width: noble ? 0.13 : 0.075, top: 0.1, bottom: 0.12 },
    ], coat, "haunch")
    if (common) {
      // A raised hip and a few shallow rib planes, rather than painted skeletal stripes.
      bodyPart([{ at: [sign * 0.265, h + 0.28, -0.8], width: 0.035, top: 0.09 }, { at: [sign * 0.29, h + 0.15, -0.68], width: 0.045, top: 0.045 }], light, "hip-ridge")
      for (let i = 0; i < 3; i++) bodyPart([
        { at: [sign * 0.305, h + 0.17, -0.02 + i * 0.14], width: 0.018, top: 0.06 },
        { at: [sign * 0.29, h + 0.015, 0.02 + i * 0.14], width: 0.02, top: 0.03 },
      ], light, "rib-plane")
    }
  }
  if (stripe) {
    bodyPart(rings.slice(1, -1).map(([z, , top]) => ({ at: [0, h + 0.11 + top + 0.006, z * length] as Point, width: 0.024, top: 0.008 })), dark, "dorsal-stripe")
  }

  if (donkey && stripe) for (const sign of [-1, 1]) bodyPart([
    { at: [0, h + 0.50, 0.38], width: 0.035, top: 0.015 },
    { at: [sign * 0.27, h + 0.31, 0.42], width: 0.035, top: 0.015 },
  ], dark, "shoulder-cross")
  if (hitched) {
    const strap = (a: Point, b: Point, radius = 0.035) => {
      const mesh = m.bar(a, b, radius, "#453525")
      mesh.updateMatrix(); mesh.geometry.applyMatrix4(mesh.matrix)
      mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1)
      skin.push({ geometry: mesh.geometry, bind: new Float32Array(mesh.geometry.attributes.position.array) })
    }
    for (const sign of [-1, 1]) {
      strap([sign * breadth * 1.08, h - 0.2, 0], [sign * breadth * 1.1, h + 0.3, 0])
      strap([sign * breadth * 1.1, h + 0.3, 0], [sign * 0.13, h + 0.5, 0])
      strap([sign * breadth * 0.95, h - 0.08, 0.76], [sign * breadth * 1.12, h + 0.27, 0.55], 0.05)
      strap([sign * breadth * 1.12, h + 0.27, 0.55], [sign * 0.12, h + 0.52, 0.47], 0.04)
      strap([sign * breadth * 1.13, h - 0.05, 0.64], [sign * breadth * 1.35, h - 0.22, -0.85], 0.028)
    }
    strap([-breadth * 0.95, h - 0.08, 0.76], [breadth * 0.95, h - 0.08, 0.76], 0.065)
    strap([-0.13, h + 0.5, 0], [0.13, h + 0.5, 0])
    strap([-0.12, h + 0.52, 0.47], [0.12, h + 0.52, 0.47])
  }

  const neck = new THREE.Group(); neck.name = "articulated-neck"; m.root.add(neck)
  const neckOrigin: Point = [0, h + 0.18, 0.58]
  const poll: Point = noble ? [0, 1.02, 0.4] : donkey ? [0, 0.39, 0.64] : [0, 0.58, 0.75]
  const neckShape: CrossSection[] = [
    { at: [0, -0.13, 0.01], width: breadth * 0.71, top: noble ? 0.35 : 0.24, bottom: 0.25 },
    { at: [0, poll[1] * 0.35, poll[2] * 0.33], width: noble ? 0.28 : donkey ? 0.185 : 0.18, top: noble ? 0.34 : 0.20, bottom: 0.20 },
    { at: [0, poll[1] * 0.76, poll[2] * 0.70], width: noble ? 0.21 : 0.135, top: noble ? 0.24 : 0.135, bottom: 0.14 },
    { at: poll, width: 0.115, top: 0.13, bottom: 0.12 },
  ]
  m.mesh(loft(neckShape), coat, [0, 0, 0], neck)
  const head = new THREE.Group(); head.name = "articulated-head"; head.position.set(...poll); neck.add(head)
  const faceLength = donkey ? 0.88 : 1, faceForward = noble ? 0.86 : 1
  const headShape: CrossSection[] = [
    { at: [0, 0.04, -0.04], width: 0.095, top: 0.10, bottom: 0.08 },
    { at: [0, -0.08, 0.09], width: donkey ? 0.16 : 0.18, top: 0.15, bottom: 0.13 },
    { at: [0, -0.24, 0.20], width: donkey ? 0.155 : 0.18, top: 0.145, bottom: 0.145 },
    { at: [0, -0.37, 0.37], width: 0.115, top: 0.095, bottom: 0.075 },
    { at: [0, -0.49, 0.48], width: 0.13, top: 0.08, bottom: 0.075 },
  ].map(s => ({ ...s, at: [s.at[0], s.at[1] * faceLength, s.at[2] * faceForward] as Point }))
  m.mesh(loft(headShape), coat, [0, 0, 0], head)
  m.mesh(loft([
    { at: [0, -0.43 * faceLength, 0.44 * faceForward], width: 0.125, top: 0.08, bottom: 0.08 },
    { at: [0, -0.51 * faceLength, 0.52 * faceForward], width: 0.145, top: 0.085, bottom: 0.075 },
    { at: [0, -0.53 * faceLength, 0.59 * faceForward], width: 0.115, top: 0.065, bottom: 0.04 },
  ]), muzzle, [0, 0, 0], head)
  const ears: THREE.Group[] = []
  for (const sign of [-1, 1]) {
    m.box([sign * 0.166, -0.08, 0.10 * faceForward], [0.028, 0.03, 0.045], "#201e19", head)
    m.box([sign * 0.132, -0.46 * faceLength, 0.53 * faceForward], [0.018, 0.03, 0.045], dark, head)
    const ear = new THREE.Group(); ear.position.set(sign * 0.105, 0.045, -0.005); ear.rotation.z = -sign * (donkey ? 0.20 : common ? 0.32 : 0.12); head.add(ear); ears.push(ear)
    const earHeight = donkey ? 0.42 : noble ? 0.22 : 0.20
    m.mesh(loft([
      { at: [0, 0, 0], width: 0.048, top: 0.045 },
      { at: [0, earHeight * 0.6, 0.012], width: donkey ? 0.065 : 0.05, top: 0.038 },
      { at: [0, earHeight, 0.02], width: 0.008, top: 0.009 },
    ]), coat, [0, 0, 0], ear)
    m.mesh(loft([{ at: [0, 0.055, 0.04], width: 0.023, top: 0.009 }, { at: [0, earHeight * 0.7, 0.043], width: 0.024, top: 0.008 }, { at: [0, earHeight * 0.92, 0.025], width: 0.005, top: 0.005 }]), dark, [0, 0, 0], ear)
  }
  // A continuous crest with an uneven hanging edge; the common horse's mane is sparse.
  for (let i = 0; i < (donkey ? 7 : 9); i++) {
    const u = i / (donkey ? 7 : 9), y = poll[1] * u, z = poll[2] * u - (noble ? 0.22 : 0.14)
    m.mesh(loft([
      { at: [0, y - 0.04, z], width: 0.05, top: 0.05 },
      { at: [common ? 0.065 : 0.03, y + (donkey ? 0.12 : 0.04), z - 0.03], width: donkey ? 0.035 : 0.08, top: 0.07 },
      { at: [donkey ? 0.02 : 0.1, y + (donkey ? 0.15 : -0.12 - i % 3 * 0.025), z + 0.025], width: 0.01, top: 0.02 },
    ]), dark, [0, 0, 0], neck)
  }
  const tail = new THREE.Group(); tail.name = "articulated-tail"; m.root.add(tail)
  m.mesh(loft([
    { at: [0, 0, 0], width: donkey ? 0.035 : 0.085, top: 0.06 },
    { at: [0.025, -0.31, -0.14], width: donkey ? 0.025 : 0.12, top: 0.06 },
    { at: [0.03, donkey ? -0.62 : -0.85, -0.2], width: donkey ? 0.065 : common ? 0.065 : 0.13, top: 0.06 },
    { at: [0.02, donkey ? -0.79 : -1.1, -0.25], width: 0.015, top: 0.018 },
  ]), dark, [0, 0, 0], tail)

  const legs = new THREE.Group(); legs.name = "articulated-legs"; m.root.add(legs)
  function segment(a: Point, b: Point, widths: [number, number, number], color: string) {
    // Local taper follows the true joint chain, with a broader proximal muscle.
    const geometry = loft([{ at: [0, 0, 0], width: widths[0], top: widths[0] },
      { at: [0, 0, 0.28], width: widths[1], top: widths[1] * 0.9 },
      { at: [0, 0, 1], width: widths[2], top: widths[2] }], 8)
    const mesh = m.mesh(geometry, color, a, legs), delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a))
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize()); mesh.scale.z = delta.length()
  }
  const joints: Partial<Record<AnimalJoint, { position: Point; editable: boolean; reason?: string }>> = {}
  return { ...m, joints: () => joints, pose(phase: number, moving: boolean, grazing = 0, edits?: AnimalRigEdits) {
    const clip: AnimalClip = moving ? "walk" : grazing > 0.5 ? "graze" : "idle"
    const motion = animalMotion(kind, phase, moving, variant)
    for (const { geometry, bind } of skin) {
      const positions = geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < positions.count; i++) positions.setXYZ(i, ...spinePoint([bind[i * 3], bind[i * 3 + 1], bind[i * 3 + 2]], kind, phase, moving, variant))
      positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere()
    }
    neck.position.set(...spinePoint(neckOrigin, kind, phase, moving, variant)); neck.rotation.set(motion.pitch + motion.neck, 0, motion.roll)
    head.rotation.x = (donkey ? 0.16 : noble ? -0.05 : 0.10) + motion.head
    if (grazing > 0) {
      // Rotate from the shoulder, keeping the poll attached. Solve nose height
      // so the grazing mouth reaches grass instead of passing through it.
      const target = 0.08 + Math.sin(phase * Math.PI * 4) * 0.012
      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, -0.95, grazing)
      const tip = new THREE.Vector3(0, -0.53 * faceLength, 0.59 * faceForward).applyEuler(head.rotation).add(new THREE.Vector3(...poll))
      let lo = 0, hi = 2.1
      for (let i = 0; i < 20; i++) {
        const angle = (lo + hi) / 2
        if (neck.position.y + tip.y * Math.cos(angle) - tip.z * Math.sin(angle) > target) lo = angle
        else hi = angle
      }
      neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, (lo + hi) / 2, grazing)
      neck.rotation.y = Math.sin(phase * Math.PI * 2) * 0.035 * grazing
    }
    const headOffset = animalOffset(edits, clip, "head", phase)
    head.position.set(poll[0] + headOffset[0], poll[1] + headOffset[1], poll[2] + headOffset[2])
    ears.forEach((ear, i) => { ear.rotation.x = (common ? -0.22 : donkey ? 0.08 : 0) + (moving ? Math.sin(phase * Math.PI * 2 + i) * 0.04 : 0) })
    tail.position.set(...spinePoint([0, h + (noble ? 0.49 : 0.38), -length * 0.97], kind, phase, moving, variant)); tail.rotation.set(motion.pitch, motion.tail, motion.roll + motion.tail * 0.3)
    if (grazing) { tail.rotation.y += Math.sin(phase * Math.PI * 2) * 0.32 * grazing; tail.rotation.z += Math.sin(phase * Math.PI * 4) * 0.07 * grazing }
    const tailOffset = animalOffset(edits, clip, "tail", phase)
    tail.position.add(new THREE.Vector3(...tailOffset))
    joints.chest = { position: spinePoint([0, h + 0.2, profile.legZ], kind, phase, moving, variant), editable: false }
    joints.pelvis = { position: spinePoint([0, h + 0.2, -profile.legZ], kind, phase, moving, variant), editable: false }
    for (const child of [...legs.children]) { legs.remove(child); if (child instanceof THREE.Mesh) child.geometry.dispose() }
    for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
      const p = animalLeg(kind, side, rear, phase, moving, variant), muscle = noble ? 1.2 : donkey ? 0.85 : 0.83
      const register = (name: AnimalJoint, position: Point) => { joints[name] = { position, editable: false, reason: "This joint follows the shared equine contact solver." } }
      register(`${side}${rear ? "Hip" : "Shoulder"}`, p.hip)
      register(`${side}${rear ? "Thigh" : "Elbow"}`, p.upperJoint)
      register(`${side}${rear ? "Knee" : "Wrist"}`, p.knee)
      register(`${side}${rear ? "Foot" : "Hand"}`, p.ankle)
      segment(p.hip, p.upperJoint, [0.12 * muscle, (rear ? 0.16 : 0.125) * muscle, 0.075 * muscle], coat)
      segment(p.upperJoint, p.knee, [0.08 * muscle, 0.09 * muscle, 0.045], coat)
      segment(p.knee, p.ankle, [0.053, 0.046, 0.038], points)
      m.mesh(loft([{ at: [p.ankle[0], p.ankle[1] - 0.035, p.ankle[2] - 0.055], width: 0.073, top: 0.035, bottom: 0.035 },
        { at: [p.ankle[0], p.ankle[1] - 0.035, p.ankle[2] + 0.105], width: 0.078, top: 0.025, bottom: 0.035 }], 8), "#3d3a32", [0, 0, 0], legs)
    }
    m.root.updateMatrixWorld(true)
    const position = new THREE.Vector3()
    head.getWorldPosition(position); m.root.worldToLocal(position)
    joints.head = { position: position.toArray() as Point, editable: true }
    tail.getWorldPosition(position); m.root.worldToLocal(position)
    joints.tail = { position: position.toArray() as Point, editable: true }
  } }
}
