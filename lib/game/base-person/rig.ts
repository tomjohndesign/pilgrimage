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
  const female = recipe.design.bodyType === "Female"
  const robe = recipe.design.garment === "Robe"
  const longGarment = female || robe
  const sleeveColor = female && !robe ? recipe.design.shirtColor : recipe.palette.tunic
  const palette = recipe.palette
  const skin = material(palette.skin), tunic = material(palette.tunic)
  const beltMaterial = material(palette.belt), hair = material(recipe.design.hairColor)
  const undershirt = material(recipe.design.shirtColor), covering = material(recipe.design.coveringColor)
  const leftDebug = material("#329bc2"), rightDebug = material("#db7540")
  const tracked: Array<{ mesh: THREE.Mesh; normal: THREE.Material | THREE.Material[]; side: BodySide }> = []
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, position: Point3 = [0, 0, 0]) => {
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
  const legCloth = material(female ? palette.skin : recipe.design.trouserColor)
  legCloth.clippingPlanes = [hemPlane]
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
    // Close the shoulder surface around the neck. Leaving the lathe open here
    // exposed the background through both sides of the collar from above/back.
    new THREE.Vector2(0.072, b.torsoShoulderHeight + 0.015),
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
  torso.name = robe ? "robe" : female ? "sleeveless-dress" : "shirt"
  torso.userData.inkPart = 3
  if (female && !robe) {
    // The upper shirt and dress straps share a surface: no intersecting layers
    // or flickering at the neckline. Two broad straps cross front and back.
    torso.material = [tunic, undershirt]
    const geometry = torso.geometry, positions = geometry.getAttribute("position"), indices = geometry.index!
    geometry.clearGroups()
    for (let i = 0; i < indices.count; i += 3) {
      const vertices = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
      const x = vertices.reduce((sum, v) => sum + positions.getX(v), 0) / 3
      const y = vertices.reduce((sum, v) => sum + positions.getY(v), 0) / 3
      const shirtVisible = y > b.chestHeight && (Math.abs(x) < b.torsoTop * 0.42 || Math.abs(x) > b.torsoTop * 0.88)
      geometry.addGroup(i, 3, shirtVisible ? 1 : 0)
    }
  }
  torso.scale.z = 0.72
  if (recipe.design.beltStyle === "Rope") {
    const rope = (name: string, points: THREE.Vector3[], closed = false) => {
      const curve = new THREE.CatmullRomCurve3(points, closed)
      const cord = mesh(new THREE.TubeGeometry(curve, closed ? 48 : 20, 0.028, 5, closed), beltMaterial, root)
      cord.name = name
      // Keep the narrow, light cord readable against the robe after pixel inking.
      cord.userData.inkPart = 3
    }
    rope("rope-belt", Array.from({ length: 24 }, (_, i) => {
      const angle = i / 24 * Math.PI * 2
      return new THREE.Vector3(Math.sin(angle) * b.waistRadius * 1.06, waist, Math.cos(angle) * b.waistRadius * 0.79)
    }), true)
    const front = b.waistRadius * 0.79
    const knot = ellipsoid(root, [0.055, waist, front + 0.025], [0.034, 0.035, 0.032], beltMaterial)
    knot.name = "rope-knot"
    knot.userData.inkPart = 3
    for (const [index, offset] of [-0.02, 0.03].entries()) {
      rope(`rope-tail-${index}`, [
        new THREE.Vector3(0.055, waist, front + 0.03),
        new THREE.Vector3(0.055 + offset, waist - 0.16, front + 0.075),
        new THREE.Vector3(0.065 + offset, waist - 0.36, front + 0.09),
        new THREE.Vector3(0.04 + offset, b.tunicHem + 0.16 + index * 0.08, b.torsoBottom * recipe.design.hem * 0.96),
      ])
    }
  } else {
    const belt = mesh(new THREE.CylinderGeometry(b.waistRadius * 1.02, b.waistRadius * 1.04, 0.035, 12), beltMaterial, root, [0, waist, 0])
    belt.scale.z = 0.74
  }
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
  if (recipe.design.hairStyle === "Tonsure") {
    // An open ring follows the scalp; the actual skin crown stays exposed.
    const ring = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(b.headWidth * 1.04, b.headHeight * 0.05),
      new THREE.Vector2(b.headWidth * 0.96, b.headHeight * 0.6),
    ], 10), hair, root, [0, b.headCenter, 0])
    ring.name = "tonsure"
    ring.scale.z = b.headDepth / b.headWidth
    hair.side = THREE.DoubleSide
  } else if (recipe.design.hairStyle !== "Bald") {
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
  if (female && !robe) {
    const coif = mesh(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.48), covering, root, [0, b.headCenter + 0.06, -0.025])
    coif.name = "head-covering"
    coif.scale.set(b.headWidth * 1.18, b.headHeight * 1.08, b.headDepth * 1.2)
    const veil = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(b.headWidth * 1.1, -b.headHeight * 1.2),
      new THREE.Vector2(b.headWidth * 1.22, -b.headHeight * 0.45),
      new THREE.Vector2(b.headWidth * 1.15, b.headHeight * 0.4),
    ], 10, Math.PI / 2, Math.PI), covering, root, [0, b.headCenter + 0.025, -0.045])
    veil.name = "head-covering-drape"
    veil.scale.z = b.headDepth / b.headWidth * 1.15
    covering.side = THREE.DoubleSide
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
    const armSkin = material(palette.skin), armTunic = material(sleeveColor)
    const shoulder = new THREE.Group()
    shoulder.position.set(sign * b.shoulderOffset, b.shoulderHeight, 0)
    shoulder.name = `${side}-shoulder`
    shoulder.rotation.z = sign * THREE.MathUtils.degToRad(recipe.design.armAngle)
    root.add(shoulder)
    // A cloth shoulder seam reaches from inside the torso into the sleeve root.
    // It follows attachment position, keeping raised/wide shoulders connected.
    const seamStart = new THREE.Vector3(sign * b.torsoTop * 0.70, b.torsoShoulderHeight - 0.025, 0)
    const seamEnd = shoulder.position.clone()
    const seamVector = seamEnd.clone().sub(seamStart)
    const seamRadius = 0.085 * recipe.design.sleeves * (female ? 0.82 : 1)
    const seam = mesh(new THREE.CylinderGeometry(seamRadius, seamRadius, Math.max(0.001, seamVector.length()), 8), armTunic, root)
    seam.name = `${side}-shoulder-seam`
    seam.position.copy(seamStart).add(seamEnd).multiplyScalar(0.5)
    if (seamVector.lengthSq() > 0) seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), seamVector.normalize())
    // Full sleeves gather at the wrist; the elbow joint stays inside the cloth.
    const fullness = recipe.design.sleeves * (female ? 0.82 : 1)
    const sleeve = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.079 * fullness, -b.upperArmLength - 0.025),
      new THREE.Vector2(0.12 * fullness, -b.upperArmLength * 0.55),
      new THREE.Vector2(0.11 * fullness, -0.015),
      new THREE.Vector2(0.06 * fullness, 0.025),
      new THREE.Vector2(0, 0.04),
    ], 8), armTunic, shoulder)
    sleeve.name = `${side}-upper-sleeve`
    const elbow = new THREE.Group()
    elbow.position.y = -b.upperArmLength
    elbow.name = `${side}-elbow`
    elbow.rotation.x = -THREE.MathUtils.degToRad(recipe.design.elbowBend)
    shoulder.add(elbow)
    const forearm = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.047, -b.forearmLength),
      new THREE.Vector2(0.06 * fullness, -b.forearmLength + 0.03),
      new THREE.Vector2(0.11 * fullness, -b.forearmLength * 0.48),
      new THREE.Vector2(0.088 * fullness, 0.035),
    ], 8), armTunic, elbow)
    forearm.name = `${side}-lower-sleeve`
    const hand = ellipsoid(elbow, [0, -b.forearmLength - 0.025 * recipe.design.hands, 0], [0.043 * recipe.design.hands, 0.06 * recipe.design.hands, 0.04 * recipe.design.hands], armSkin)
    hand.name = `${side}-hand`
    socket(side === "left" ? "leftHand" : "rightHand", elbow, [0, -b.forearmLength - 0.04 * recipe.design.hands, 0])
    const thigh = mesh(new THREE.CylinderGeometry(b.thighWidth, b.shinWidth, 1, 6), legCloth, root)
    const shin = mesh(new THREE.CylinderGeometry(b.shinWidth, b.shinWidth * 0.8, 1, 6), legCloth, root)
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
    thigh.name = `${side}-${female ? "leg" : "trouser"}-upper`
    shin.name = `${side}-${female ? "leg" : "trouser"}-lower`
    if (longGarment) {
      foot.material = legCloth
      foot.userData.clipAboveHem = true
    }
    for (const part of [thigh, shin]) part.userData.clipAboveHem = true
    for (const part of [seam, sleeve, forearm, hand]) part.userData.inkPart = side === "left" ? 8 : 9
    for (const part of [thigh, shin, foot]) part.userData.inkPart = side === "left" ? 6 : 7
    for (const object of [seam, sleeve, forearm, hand, thigh, shin, foot]) tracked.push({ mesh: object, normal: object.material, side })
    return { side, shoulder, elbow, thigh, shin, foot, armSkin, armTunic, armParts: [seam, sleeve, forearm, hand] }
  })
  // Separate the upper body at the hips, keeping all outfit pieces and sockets together.
  const body = new THREE.Group(), poseRoot = new THREE.Group()
  const legMeshes = new Set(limbs.flatMap(limb => [limb.thigh, limb.shin, limb.foot]))
  for (const child of [...root.children]) {
    if (legMeshes.has(child as THREE.Mesh)) poseRoot.add(child)
    else { body.add(child); child.position.y -= b.hipHeight }
  }
  body.position.y = b.hipHeight
  poseRoot.add(body); root.add(poseRoot)
  const axe = new THREE.Group()
  axe.name = "woodcutting-axe"
  const wood = material("#785637"), steel = material("#a4b4b5")
  mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.62, 6), wood, axe, [0, 0.20, 0])
  mesh(new THREE.BoxGeometry(0.24, 0.14, 0.055), steel, axe, [0.09, 0.46, 0])
  sockets.rightHand.add(axe)
  axe.visible = false
  // Solve both arm bones to a hand target in the upper body's coordinates.
  const reach = (limb: typeof limbs[number], target: Point3) => {
    const start = limb.shoulder.position.clone(), end = new THREE.Vector3(...target)
    const axis = end.clone().sub(start)
    const distance = Math.min(axis.length(), b.upperArmLength + b.forearmLength - 0.001)
    axis.normalize(); end.copy(start).addScaledVector(axis, distance)
    const along = (b.upperArmLength ** 2 - b.forearmLength ** 2 + distance ** 2) / (2 * distance)
    const bend = new THREE.Vector3(limb.side === "left" ? 1 : -1, -0.4, 0)
    bend.addScaledVector(axis, -bend.dot(axis)).normalize()
    const joint = start.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, b.upperArmLength ** 2 - along ** 2)))
    limb.shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), joint.clone().sub(start).normalize())
    const lower = end.sub(joint).normalize().applyQuaternion(limb.shoulder.quaternion.clone().invert())
    limb.elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lower)
  }
  const from = new THREE.Vector3(), to = new THREE.Vector3(), direction = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const bone = (object: THREE.Mesh, a: Point3, c: Point3) => {
    from.set(...a); to.set(...c)
    object.position.copy(from).add(to).multiplyScalar(0.5)
    direction.subVectors(to, from)
    object.scale.y = direction.length()
    object.quaternion.setFromUnitVectors(up, direction.normalize())
  }
  const skirtPositions = torso.geometry.getAttribute("position")
  const restSkirt = new Float32Array(skirtPositions.array)
  const masks = new Map<string, THREE.MeshBasicMaterial>()
  const masked: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
  const baseParts = new Map<THREE.Material, number>([[skin, 1], [tunic, 3], [beltMaterial, 5], [hair, 2], [covering, 2], [undershirt, 3]])
  return {
    root, sockets,
    view(row: number) {
      root.rotation.y = -row * Math.PI / 4
      const facing = Math.sin(row * Math.PI / 4)
      for (const limb of limbs) {
        const depth = (limb.side === "left" ? 1 : -1) * facing
        const rear = depth < -0.1
        limb.armSkin.color.set(palette.skin).multiplyScalar(rear ? 0.55 : 1)
        limb.armTunic.color.set(sleeveColor).multiplyScalar(rear ? 0.68 : 1)
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
      const wave = Math.sin(phase * Math.PI * 2)
      const seated = clip === "sitting", praying = clip === "praying"
      const sleep = clip === "sleeping", chop = clip === "woodcutting", gather = clip === "gathering"
      const drop = seated ? 0.25 - b.hipHeight : praying ? 0.1 + b.thighLength * 0.9 - b.hipHeight : gather ? -0.24 : 0
      poseRoot.rotation.set(sleep ? -Math.PI / 2 : 0, 0, 0)
      poseRoot.position.set(0, sleep ? b.torsoTop * 0.78 : 0, sleep ? (b.headCenter + b.headHeight) / 2 + 0.03 : 0)
      body.position.y = b.hipHeight + drop
      body.rotation.x = gather ? 0.85 + wave * 0.12 : chop ? 0.12 + (1 - Math.cos(phase * Math.PI * 2)) * 0.12 : praying ? 0.12 + wave * 0.025 : sleep ? wave * 0.008 : seated ? 0.035 * wave : 0
      axe.visible = chop
      for (let i = 0; i < skirtPositions.count; i++) {
        const y = restSkirt[i * 3 + 1], z = restSkirt[i * 3 + 2]
        const weight = Math.max(0, (waist - y) / (waist - b.tunicHem))
        // Drape long skirts over bent knees, with the hem resting above ground.
        skirtPositions.setY(i, seated || praying || gather ? Math.max(y, 0.07 - drop) : y)
        skirtPositions.setZ(i, z + ((seated ? 0.48 : praying ? 0.19 : 0) * weight) +
          (longGarment && (clip === "walk" || clip === "carrying") ? wave * 0.035 * recipe.design.stride * weight * weight : 0))
      }
      skirtPositions.needsUpdate = true
      torso.geometry.computeVertexNormals()
      for (const limb of limbs) {
        const leg = legPose(limb.side, phase, clip, b)
        bone(limb.thigh, leg.hip, leg.knee)
        bone(limb.shin, leg.knee, leg.ankle)
        limb.foot.position.set(leg.ankle[0], leg.ankle[1] - b.ankleHeight + b.footHeight / 2, leg.ankle[2] + b.footLength * 0.22)
        limb.shoulder.rotation.set(armAngle(limb.side, phase, clip) * recipe.design.armSwing, 0,
          (limb.side === "left" ? 1 : -1) * THREE.MathUtils.degToRad(recipe.design.armAngle))
        limb.elbow.rotation.set(-THREE.MathUtils.degToRad(recipe.design.elbowBend), 0, 0)
        const sign = limb.side === "left" ? 1 : -1
        if (praying) reach(limb, [sign * 0.035, b.chestHeight - b.hipHeight, 0.33])
        else if (chop) {
          const lift = (1 + Math.cos(phase * Math.PI * 2)) / 2
          reach(limb, [sign * 0.035, 0.22 + lift * 0.72, 0.36 - lift * 0.13])
        } else if (clip === "carrying") reach(limb, [sign * 0.2, 0.15, 0.34])
        else if (gather) reach(limb, [sign * 0.16, -0.12 + wave * 0.06, 0.36])
        else if (seated) reach(limb, [sign * 0.21, 0.02, 0.30])
        else if (sleep) reach(limb, [sign * 0.09, 0.22, 0.24])
      }
      root.updateMatrixWorld(true)
      if (chop) {
        const lift = (1 + Math.cos(phase * Math.PI * 2)) / 2
        const desired = body.getWorldQuaternion(new THREE.Quaternion()).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.35 - lift * 1.55))
        axe.quaternion.copy(sockets.rightHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired))
        axe.updateMatrixWorld(true)
      }
      // The clipping plane follows a lying body; bent legs are covered by the draped mesh.
      hemPlane.set(new THREE.Vector3(0, -1, 0), seated || praying || gather || chop ? 10 : b.tunicHem + 0.012)
      hemPlane.applyMatrix4(poseRoot.matrixWorld)
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
