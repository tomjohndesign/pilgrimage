import * as THREE from "three"
import { personRecipe } from "./design"
import { armAngle, legPose, SOCKET_NAMES, type BaseClip, type BodySide, type Point3, type SocketName } from "./pose"

/** One authored body; all directions, poses and future outfits reuse this rig. */
export function createBasePersonRig(recipe = personRecipe()) {
  const root = new THREE.Group()
  root.name = "base-person"
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.MeshLambertMaterial[] = []
  const material = (color: string) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.push(m)
    return m
  }
  const palette = recipe.palette
  const skin = material(palette.skin), tunic = material(palette.tunic)
  const beltMaterial = material(palette.belt), hair = material(recipe.design.hairColor)
  const leftDebug = material("#329bc2"), rightDebug = material("#db7540")
  const tracked: Array<{ mesh: THREE.Mesh; normal: THREE.Material; side: BodySide }> = []
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, position: Point3 = [0, 0, 0]) => {
    geometries.push(geometry)
    const object = new THREE.Mesh(geometry, mat)
    object.position.set(...position)
    parent.add(object)
    return object
  }
  const ellipsoid = (parent: THREE.Object3D, position: Point3, scale: Point3, mat: THREE.Material) => {
    const object = mesh(new THREE.SphereGeometry(1, 8, 6), mat, parent, position)
    object.scale.set(...scale)
    return object
  }
  const sockets = {} as Record<SocketName, THREE.Object3D>
  const socket = (name: SocketName, parent: THREE.Object3D, position: Point3) => {
    const node = new THREE.Object3D()
    node.name = name; node.position.set(...position); parent.add(node); sockets[name] = node
  }
  const b = recipe.body
  const hemPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), b.tunicHem + 0.012)
  const legSkin = material(palette.skin)
  legSkin.clippingPlanes = [hemPlane]
  const leftLegDebug = material("#329bc2"), rightLegDebug = material("#db7540")
  leftLegDebug.clippingPlanes = rightLegDebug.clippingPlanes = [hemPlane]
  // Authored contour: shoulder, chest, pinched waist and a flared skirt.
  // The parameters move these landmarks together instead of scaling a blob.
  const waist = b.torsoCenter - 0.16
  const torso = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(b.torsoBottom * 1.25 * recipe.design.hem, b.tunicHem),
    new THREE.Vector2(b.torsoBottom * 1.30 * recipe.design.hem, b.tunicHemUpper),
    new THREE.Vector2(b.torsoBottom * 1.08, waist - 0.08),
    new THREE.Vector2(b.waistRadius, waist),
    new THREE.Vector2(b.torsoTop * 0.91, b.chestHeight),
    new THREE.Vector2(b.torsoTop, b.torsoShoulderHeight - 0.06),
    new THREE.Vector2(b.torsoTop * 0.82, b.torsoShoulderHeight + 0.01),
  ], 12), tunic, root)
  // A shallow front contour creates the bust under the tunic, keeping one
  // continuous garment surface instead of attaching separate rounded forms.
  if (b.bustDepth > 0) {
    const positions = torso.geometry.getAttribute("position")
    for (let i = 0; i < positions.count; i++) {
      const z = positions.getZ(i), y = positions.getY(i)
      const chestWeight = Math.exp(-(((y - b.chestHeight) / 0.12) ** 2))
      positions.setZ(i, z + b.bustDepth / 0.72 * chestWeight * Math.max(0, z / b.torsoTop) ** 2)
    }
    positions.needsUpdate = true
    torso.geometry.computeVertexNormals()
  }
  torso.scale.z = 0.72
  const belt = mesh(new THREE.CylinderGeometry(b.waistRadius * 1.02, b.waistRadius * 1.04, 0.035, 12), beltMaterial, root, [0, waist, 0])
  belt.scale.z = 0.74
  // Join the lowered collar to the jaw, retaining a visible neck at every head size.
  const neckBottom = b.torsoShoulderHeight - 0.015
  const neckTop = b.headCenter - b.headHeight * 0.72
  mesh(new THREE.CylinderGeometry(0.065, 0.078, neckTop - neckBottom, 8), skin, root, [0, (neckBottom + neckTop) / 2, 0])
  const head = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(b.headWidth * 0.5, -b.headHeight),
    new THREE.Vector2(b.headWidth * 0.85, -b.headHeight * 0.6),
    new THREE.Vector2(b.headWidth, b.headHeight * 0.1),
    new THREE.Vector2(b.headWidth * 0.9, b.headHeight * 0.65),
    new THREE.Vector2(b.headWidth * 0.4, b.headHeight),
    new THREE.Vector2(0, b.headHeight * 1.02),
  ], 10), skin, root, [0, b.headCenter, 0])
  head.scale.z = b.headDepth / b.headWidth
  // A small wedge makes the side-facing nose readable at native resolution.
  const nose = mesh(new THREE.ConeGeometry(b.headWidth * 0.28 * recipe.design.nose, b.headDepth * 0.65 * recipe.design.nose, 4), skin, root,
    [0, b.headCenter - 0.015, b.headDepth * (0.85 + 0.23 * recipe.design.nose)])
  nose.rotation.x = Math.PI / 2
  if (recipe.design.hairStyle !== "Bald") {
    const cap = mesh(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.51), hair, root, [0, b.headCenter + 0.02, -0.006])
    cap.scale.set(b.headWidth * 1.1, b.headHeight * 1.08, b.headDepth * 1.12)
    if (recipe.design.hairStyle === "Long") {
      const back = mesh(new THREE.LatheGeometry([
        new THREE.Vector2(b.headWidth * 0.92, -b.headHeight * 1.8),
        new THREE.Vector2(b.headWidth * 1.14, -b.headHeight * 0.8),
        new THREE.Vector2(b.headWidth * 1.08, b.headHeight * 0.3),
      ], 10, Math.PI / 2, Math.PI), hair, root, [0, b.headCenter, -0.015])
      back.scale.z = b.headDepth / b.headWidth * 1.05
      hair.side = THREE.DoubleSide
    }
    if (recipe.design.hairStyle === "Bob") {
      const back = mesh(new THREE.SphereGeometry(1, 10, 6, Math.PI, Math.PI), hair, root, [0, b.headCenter - 0.025, -0.018])
      back.scale.set(b.headWidth * 1.13, b.headHeight * 1.12, b.headDepth * 1.16)
    }
  }
  if (recipe.design.beard) {
    const beard = mesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI), hair, root, [0, b.headCenter - b.headHeight * 0.65, b.headDepth * 0.12])
    beard.scale.set(b.headWidth * 0.9, b.headHeight * 0.55, b.headDepth * 1.08)
  }
  socket("head", root, [0, b.headCenter + b.headHeight + 0.02, 0])
  socket("back", root, [0, b.chestHeight, -b.torsoTop * 0.8])
  socket("leftHip", root, [b.torsoBottom, b.hipHeight + 0.02, 0])
  socket("rightHip", root, [-b.torsoBottom, b.hipHeight + 0.02, 0])

  const limbs = (Object.keys({ left: 0, right: 0 }) as BodySide[]).map((side) => {
    const sign = side === "left" ? 1 : -1
    const armSkin = material(palette.skin), armTunic = material(palette.tunic)
    const shoulder = new THREE.Group()
    shoulder.position.set(sign * b.shoulderOffset, b.shoulderHeight, 0)
    root.add(shoulder)
    const sleeve = mesh(new THREE.CylinderGeometry(0.095, 0.085, b.upperArmLength * 0.76, 6), armTunic, shoulder, [0, -0.095, 0])
    const upper = mesh(new THREE.CylinderGeometry(0.051, 0.049, b.upperArmLength, 6), armSkin, shoulder, [0, -b.upperArmLength / 2, 0])
    const elbow = new THREE.Group()
    elbow.position.y = -b.upperArmLength
    elbow.rotation.x = -0.14
    shoulder.add(elbow)
    const forearm = mesh(new THREE.CylinderGeometry(0.052, 0.039, b.forearmLength, 6), armSkin, elbow, [0, -b.forearmLength / 2, 0])
    const hand = ellipsoid(elbow, [0, -b.forearmLength - 0.025, 0], [0.043, 0.06, 0.04], armSkin)
    socket(side === "left" ? "leftHand" : "rightHand", elbow, [0, -b.forearmLength - 0.04, 0])
    const thigh = mesh(new THREE.CylinderGeometry(b.thighWidth, b.shinWidth, 1, 6), legSkin, root)
    const shin = mesh(new THREE.CylinderGeometry(b.shinWidth, b.shinWidth * 0.8, 1, 6), legSkin, root)
    // Rounded heel and broad forefoot, with no sole or boot cuff.
    const sole = new THREE.Shape()
    sole.moveTo(-b.footWidth * 0.28, -b.footLength * 0.42)
    sole.quadraticCurveTo(0, -b.footLength * 0.50, b.footWidth * 0.28, -b.footLength * 0.42)
    sole.lineTo(b.footWidth * 0.44, b.footLength * 0.22)
    sole.quadraticCurveTo(b.footWidth * 0.5, b.footLength * 0.52, b.footWidth * 0.12, b.footLength * 0.54)
    sole.quadraticCurveTo(-b.footWidth * 0.48, b.footLength * 0.52, -b.footWidth * 0.48, b.footLength * 0.24)
    sole.lineTo(-b.footWidth * 0.28, -b.footLength * 0.42)
    sole.closePath()
    const footGeometry = new THREE.ExtrudeGeometry(sole, { depth: b.footHeight, bevelEnabled: true,
      bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 3, steps: 1 })
    footGeometry.rotateX(Math.PI / 2)
    footGeometry.translate(0, b.footHeight / 2, 0)
    const foot = mesh(footGeometry, skin, root)
    for (const part of [thigh, shin]) part.userData.clipAboveHem = true
    for (const part of [sleeve, upper, forearm, hand]) part.userData.inkPart = side === "left" ? 8 : 9
    for (const part of [thigh, shin, foot]) part.userData.inkPart = side === "left" ? 6 : 7
    for (const object of [sleeve, upper, forearm, hand, thigh, shin, foot]) tracked.push({ mesh: object, normal: object.material, side })
    return { side, shoulder, thigh, shin, foot, armSkin, armTunic, armParts: [sleeve, upper, forearm, hand] }
  })
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const bone = (object: THREE.Mesh, a: Point3, c: Point3) => {
    from.set(...a); to.set(...c)
    object.position.copy(from).add(to).multiplyScalar(0.5)
    direction.subVectors(to, from)
    object.scale.y = direction.length()
    object.quaternion.setFromUnitVectors(up, direction.normalize())
  }
  const masks = new Map<string, THREE.MeshBasicMaterial>()
  const masked: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
  const baseParts = new Map<THREE.Material, number>([[skin, 1], [tunic, 3], [beltMaterial, 5], [hair, 2]])
  return {
    root, sockets,
    view(row: number) {
      root.rotation.y = -row * Math.PI / 4
      const facing = Math.sin(row * Math.PI / 4)
      for (const limb of limbs) {
        const depth = (limb.side === "left" ? 1 : -1) * facing
        const rear = depth < -0.1
        limb.armSkin.color.set(palette.skin).multiplyScalar(rear ? 0.55 : 1)
        limb.armTunic.color.set(palette.tunic).multiplyScalar(rear ? 0.68 : 1)
        // Screen depth controls edge priority; anatomical IDs stay fixed in diagnostics.
        for (const part of limb.armParts) part.userData.inkPart = rear ? 2 : depth > 0.1 ? 9 : 8
      }
    },
    inkMask(enabled: boolean) {
      if (!enabled) { for (const item of masked) item.mesh.material = item.material; masked.length = 0; return }
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const id = object.userData.inkPart ?? (baseParts.get(object.material as THREE.Material) ?? 1)
        const key = `${id}:${object.userData.clipAboveHem ? "clipped" : "full"}`
        if (!masks.has(key)) masks.set(key, new THREE.MeshBasicMaterial({
          color: new THREE.Color().setRGB(id / 255, 0, 0, THREE.SRGBColorSpace), toneMapped: false,
          clippingPlanes: object.userData.clipAboveHem ? [hemPlane] : null,
        }))
        masked.push({ mesh: object, material: object.material }); object.material = masks.get(key)!

      })
    },
    pose(phase: number, clip: BaseClip = "walk") {
      for (const limb of limbs) {
        const leg = legPose(limb.side, phase, clip, b)
        bone(limb.thigh, leg.hip, leg.knee)
        bone(limb.shin, leg.knee, leg.ankle)
        limb.foot.position.set(leg.ankle[0], leg.ankle[1] - b.ankleHeight + b.footHeight / 2, leg.ankle[2] + b.footLength * 0.22)
        limb.shoulder.rotation.x = armAngle(limb.side, phase, clip) * recipe.design.stride
      }
      root.updateMatrixWorld(true)
    },
    trackSides(enabled: boolean) {
      for (const item of tracked) item.mesh.material = enabled
        ? item.mesh.userData.clipAboveHem ? item.side === "left" ? leftLegDebug : rightLegDebug : item.side === "left" ? leftDebug : rightDebug
        : item.normal
    },
    /** Attach future outfit geometry to these nodes before baking for correct occlusion. */
    attach(name: SocketName, accessory: THREE.Object3D) { sockets[name].add(accessory) },
    dispose() {
      for (const mask of masks.values()) mask.dispose()
      for (const geometry of geometries) geometry.dispose()
      for (const m of materials) m.dispose()
      for (const name of SOCKET_NAMES) sockets[name].clear()
    },
  }
}
