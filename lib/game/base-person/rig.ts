import * as THREE from "three"
import { editedLeg } from "./edited-leg"
import { poseOffset } from "./pose-edits"
import type { RigJoints } from "./rig-joints"
import { staffMotion } from "./staff-motion"
import { createRoadAccessories } from "./road-accessories"
import { gatheringMotion } from "./gathering"
import { woodcuttingMotion, woodcuttingProfile } from "./woodcutting"
import { splittingMotion, splittingTool } from "./splitting"
import { personRecipe } from "./design"
import { armAngle, legPose, pelvisHeight, walkBody, SOCKET_NAMES, type BaseClip, type BodySide, type Point3, type SocketName } from "./pose"

/** One authored body; all directions, poses and future outfits reuse this rig. */
export function createBasePersonRig(recipe = personRecipe()) {
  const root = new THREE.Group()
  root.name = "base-person"
  const geometries: THREE.BufferGeometry[] = []
  const ropeTails: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
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
  const accent = material(recipe.design.accentColor)
  const playful = recipe.design.tunicStyle === "Particolour"
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
  const leather = material("#785637"), soleMaterial = material("#503b2b")
  const footSkin = material(palette.skin)
  if (longGarment) for (const m of [leather, soleMaterial, footSkin]) m.clippingPlanes = [hemPlane]
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
  if (playful) {
    torso.material = [tunic, accent]
    const geometry = torso.geometry, positions = geometry.getAttribute("position"), indices = geometry.index!
    geometry.clearGroups()
    for (let i = 0; i < indices.count; i += 3) {
      const vertices = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
      const x = vertices.reduce((sum, v) => sum + positions.getX(v), 0) / 3
      const y = vertices.reduce((sum, v) => sum + positions.getY(v), 0) / 3
      geometry.addGroup(i, 3, (x > 0) !== (y < waist) ? 1 : 0)
    }
    // Alternating pointed hem tabs are part of the draped garment itself.
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) <= b.tunicHemUpper + 0.001) {
        const angle = Math.atan2(positions.getX(i), positions.getZ(i))
        positions.setY(i, positions.getY(i) + 0.045 * (1 + Math.cos(angle * 6)))
      }
    }
    geometry.computeVertexNormals()
  }
  torso.scale.z = 0.72
  if (recipe.design.beltStyle === "Rope") {
    const rope = (name: string, points: THREE.Vector3[], closed = false) => {
      const curve = new THREE.CatmullRomCurve3(points, closed)
      const cord = mesh(new THREE.TubeGeometry(curve, closed ? 48 : 20, 0.028, 5, closed), beltMaterial, root)
      cord.name = name
      if (!closed) ropeTails.push(cord.geometry)
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
  const firstHeadPart = root.children.length
  const head = mesh(new THREE.LatheGeometry([
    new THREE.Vector2(b.headWidth * 0.5, -b.headHeight),
    new THREE.Vector2(b.headWidth * 0.85, -b.headHeight * 0.6),
    new THREE.Vector2(b.headWidth, b.headHeight * 0.1),
    new THREE.Vector2(b.headWidth * 0.9, b.headHeight * 0.65),
    new THREE.Vector2(b.headWidth * 0.4, b.headHeight),
    new THREE.Vector2(0, b.headHeight * 1.02),
  ], 10), skin, root, [0, b.headCenter, 0])
  head.name = "head-shape"
  head.scale.z = b.headDepth / b.headWidth
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
    if (recipe.design.hairStyle === "Wavy") {
      for (let i = 0; i < 9; i++) {
        const angle = i / 9 * Math.PI * 2
        const curl = ellipsoid(root, [Math.sin(angle) * b.headWidth * 0.87, b.headCenter + (i % 2 ? 0.04 : 0.10), Math.cos(angle) * b.headDepth * 0.88], [0.085, 0.095, 0.075], hair)
        curl.name = "hair-wave"
      }
    }
    if (recipe.design.hairStyle === "Ponytail" || recipe.design.hairStyle === "Bun") {
      const bun = recipe.design.hairStyle === "Bun"
      const tail = ellipsoid(root, [0, b.headCenter + (bun ? 0.03 : -0.15), -b.headDepth * 1.2], bun ? [0.10, 0.10, 0.095] : [0.075, 0.23, 0.085], hair)
      tail.name = bun ? "hair-bun" : "hair-ponytail"
      const tie = ellipsoid(root, [0, b.headCenter, -b.headDepth * 1.35], [0.08, 0.025, 0.075], accent)
      tie.name = "hair-tie"
    }
    if (recipe.design.hairStyle === "Braids") {
      for (const sign of [-1, 1]) for (let i = 0; i < 5; i++) {
        const braid = ellipsoid(root, [sign * (b.headWidth * 0.95 + (i % 2) * 0.015), b.headCenter - 0.04 - i * 0.067, -0.025], [0.052, 0.055, 0.052], i === 4 ? accent : hair)
        braid.name = "hair-braid"
      }
    }
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
  if (recipe.design.hat === "Coif") {
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
  // Turn the complete head around its neck attachment, including hair and sockets.
  const headPivot = new THREE.Group()
  headPivot.name = "head-pivot"
  headPivot.position.y = neckTop
  for (const part of root.children.slice(firstHeadPart)) {
    headPivot.add(part)
    part.position.y -= neckTop
  }
  root.add(headPivot)
  socket("back", root, [0, b.chestHeight, -b.torsoTop * 0.8])
  socket("leftHip", root, [b.torsoBottom, b.hipHeight + 0.02, 0])
  socket("rightHip", root, [-b.torsoBottom, b.hipHeight + 0.02, 0])

  const limbs = (Object.keys({ left: 0, right: 0 }) as BodySide[]).map((side) => {
    const sign = side === "left" ? 1 : -1
    const armSkin = material(palette.skin), armColor = playful && side === "right" ? recipe.design.accentColor : sleeveColor, armTunic = material(armColor)
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
    // Keep the authored sole envelope and ground contact for both shoe styles.
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
    const foot = mesh(footGeometry, recipe.design.footwear === "Sandals" ? footSkin : leather, root)
    foot.name = `${side}-foot`
    thigh.name = `${side}-${female ? "leg" : "trouser"}-upper`
    shin.name = `${side}-${female ? "leg" : "trouser"}-lower`
    const outsole = mesh(footGeometry.clone(), soleMaterial, foot)
    outsole.name = `${side}-sole`
    outsole.scale.y = 0.28
    outsole.position.y = -b.footHeight * 0.36
    const shoeParts = [outsole]
    if (recipe.design.footwear === "Sandals") {
      for (const z of [-0.12, 0.25]) {
        const strap = mesh(new THREE.BoxGeometry(b.footWidth * 0.88, 0.024, b.footLength * 0.14), leather, foot,
          [0, b.footHeight * 0.5, b.footLength * z])
        strap.name = `${side}-sandal-strap`
        shoeParts.push(strap)
      }
    } else {
      const cuff = mesh(new THREE.CylinderGeometry(b.shinWidth * 1.06, b.shinWidth * 0.95, 0.15, 8), leather, foot,
        [0, b.footHeight * 0.5 + 0.055, -b.footLength * 0.22])
      cuff.name = `${side}-boot-cuff`
      shoeParts.push(cuff)
    }
    for (const part of [foot, ...shoeParts]) {
      part.userData.clipAboveHem = longGarment
      part.userData.inkPart = side === "left" ? 6 : 7
    }
    for (const part of [thigh, shin]) part.userData.clipAboveHem = true
    for (const part of [seam, sleeve, forearm, hand]) part.userData.inkPart = side === "left" ? 8 : 9
    for (const part of [thigh, shin, foot]) part.userData.inkPart = side === "left" ? 6 : 7
    for (const object of [seam, sleeve, forearm, hand, thigh, shin, foot, ...shoeParts]) tracked.push({ mesh: object, normal: object.material, side })
    return { side, shoulder, elbow, thigh, shin, foot, seam, seamStart, sleeve, forearm, hand, rear: false, armSkin, armTunic, armColor, armParts: [seam, sleeve, forearm, hand] }
  })
  const roadAccessories = createRoadAccessories(recipe, sockets, root)
  // Separate the upper body at the hips, keeping all outfit pieces and sockets together.
  const body = new THREE.Group(), poseRoot = new THREE.Group()
  const legMeshes = new Set(limbs.flatMap(limb => [limb.thigh, limb.shin, limb.foot]))
  for (const child of [...root.children]) {
    if (legMeshes.has(child as THREE.Mesh)) poseRoot.add(child)
    else { body.add(child); child.position.y -= b.hipHeight }
  }
  body.name = "pelvis"
  const chest = new THREE.Group()
  chest.name = "chest-pivot"
  chest.position.y = waist - b.hipHeight
  // The torso mesh twists continuously; rigid head/arm attachments follow its top.
  for (const child of [...body.children]) {
    if (child === torso || child.name.startsWith("rope-") ||
      child === sockets.leftHip || child === sockets.rightHip ||
      (child instanceof THREE.Mesh && child.material === beltMaterial)) continue
    chest.add(child)
    child.position.y -= chest.position.y
  }
  body.add(chest)
  body.position.y = b.hipHeight
  poseRoot.add(body); root.add(poseRoot)
  const chopping = woodcuttingProfile(recipe.design)
  const axeHeadHeight = 0.68
  const axe = new THREE.Group()
  axe.name = "woodcutting-axe"
  axe.scale.setScalar(chopping.axeScale)
  const wood = material("#785637"), steel = material("#bac8cf"), grain = material("#d6b57b")
  const shaft = mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.90, 6), wood, axe, [0, 0.27, 0])
  shaft.name = "axe-handle"
  // A slim wedge flares from the socket to a broad, sharpened cutting edge along +Z.
  const bladeGeometry = new THREE.BoxGeometry(0.09, 0.18, 0.4)
  const bladeVertices = bladeGeometry.getAttribute("position")
  for (let i = 0; i < bladeVertices.count; i++) {
    const edge = (bladeVertices.getZ(i) + 0.2) / 0.4
    bladeVertices.setX(i, bladeVertices.getX(i) * (1 - 0.88 * edge))
    bladeVertices.setY(i, bladeVertices.getY(i) * (0.5 + 0.5 * edge))
  }
  bladeGeometry.computeVertexNormals()
  const blade = mesh(bladeGeometry, steel, axe, [0, axeHeadHeight, 0.17])
  blade.name = "axe-head"
  const shine = new THREE.MeshBasicMaterial({ color: "#ecf4f4", toneMapped: false })
  materials.push(shine)
  const glint = new THREE.Group()
  glint.name = "axe-glint"
  for (const side of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.005, 0.12, 0.027), shine, glint, [side * 0.022, axeHeadHeight + 0.01, 0.25])
    mesh(new THREE.BoxGeometry(0.005, 0.027, 0.08), shine, glint, [side * 0.022, axeHeadHeight + 0.01, 0.25])
  }
  axe.add(glint)
  const trail = new THREE.Group()
  trail.name = "axe-motion-streaks"
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.06, axeHeadHeight, 0.17),
      new THREE.Vector3(side * 0.06, axeHeadHeight + 0.10, -0.03),
      new THREE.Vector3(side * 0.06, axeHeadHeight + 0.07, -0.22),
    ])
    mesh(new THREE.TubeGeometry(curve, 8, 0.014, 4, false), steel, trail)
  }
  axe.add(trail)
  sockets.rightHand.add(axe)
  axe.visible = false
  const log = new THREE.Group()
  log.name = "woodcutting-log"
  log.position.z = 0.82
  log.position.y = 0.32
  log.scale.setScalar(chopping.logScale)
  const gripSpacing = 0.18
  const splitGrip = new THREE.Vector3(0, log.position.y + 0.38 * chopping.logScale + 0.33 * chopping.axeScale,
    log.position.z - axeHeadHeight * chopping.axeScale)
  // A low chopping block lets the arms deliver the blow while the chest stays upright.
  const block = mesh(new THREE.CylinderGeometry(0.20, 0.21, log.position.y, 8), [wood, grain, wood], log,
    [0, -log.position.y / (2 * chopping.logScale), 0])
  block.scale.setScalar(1 / chopping.logScale)
  block.name = "chopping-block"
  const logHalves = [-1, 1].map(side => {
    // Two lengthwise half-cylinders form one upright round until the strike.
    const half = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.38, 6, 1, false, side < 0 ? Math.PI : 0, Math.PI), [wood, grain, grain], log)
    half.name = side < 0 ? "log-left-half" : "log-right-half"
    const cut = mesh(new THREE.PlaneGeometry(0.28, 0.38), grain, half)
    cut.name = "log-split-face"
    cut.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
    for (const z of [-0.07, 0, 0.07]) {
      const line = mesh(new THREE.BoxGeometry(0.008, 0.30, 0.012), wood, half, [-side * 0.004, 0, z])
      line.name = "log-grain"
    }
    return { half, side }
  })
  // Earlier pieces remain on the ground as each freshly split pair lands in the pile.
  const splitPile = new THREE.Group()
  splitPile.name = "split-wood-pile"
  for (const { half, side } of logHalves) {
    const piece = half.clone(true)
    piece.name = `stacked-${side < 0 ? "left" : "right"}-half`
    piece.position.set(side * 0.42 / chopping.logScale, 0.14 - log.position.y / chopping.logScale, -0.16 / chopping.logScale)
    piece.rotation.z = -side * Math.PI / 2
    splitPile.add(piece)
  }
  log.add(splitPile)
  const replacement = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.38, 12), [wood, grain, grain], root)
  replacement.name = "replacement-log"
  replacement.scale.setScalar(chopping.logScale)
  replacement.visible = false
  const supplyPosition = new THREE.Vector3(0.60, 0.19 * chopping.logScale, 0.35)
  const loadedPosition = new THREE.Vector3(0, log.position.y + 0.19 * chopping.logScale, log.position.z)
  const logHold = new THREE.Vector3(0, 0.12 * chopping.logScale, -0.12 * chopping.logScale)
  const impact = new THREE.Group()
  impact.name = "woodcutting-impact"
  impact.position.y = 0.38
  for (const direction of [[-1, 0.6, 0], [1, 0.6, 0], [0, 1, 0], [0, 0.5, -1], [0, 0.5, 1]]) {
    const ray = new THREE.Vector3(...direction).normalize()
    const mark = mesh(new THREE.ConeGeometry(0.035, 0.19, 4), shine, impact)
    mark.position.copy(ray).multiplyScalar(0.16)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ray)
  }
  log.add(impact)
  root.add(log)
  log.visible = false
  const axeImpact = new THREE.Group()
  axeImpact.name = "axe-impact-lines"
  axeImpact.position.set(0, axeHeadHeight, 0.27)
  for (const direction of [[-1, 0, 0], [1, 0, 0], [-0.6, 1, 0.7], [0.6, 1, 0.7], [-0.6, -0.7, 1], [0.6, -0.7, 1]]) {
    const ray = new THREE.Vector3(...direction).normalize()
    const mark = mesh(new THREE.BoxGeometry(0.035, 0.26, 0.035), shine, axeImpact)
    mark.position.copy(ray).multiplyScalar(0.27)
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ray)
  }
  axe.add(axeImpact)
  axeImpact.visible = false
  const basket = new THREE.Group()
  basket.name = "gathering-basket"
  basket.position.set(-0.43, 0.115, 0.3)
  basket.scale.setScalar(female ? 0.7 : 1)
  mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.22, 10, 1, true), wood, basket)
  const rim = mesh(new THREE.TorusGeometry(0.21, 0.018, 4, 12), grain, basket, [0, 0.11, 0])
  rim.rotation.x = Math.PI / 2
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.1, 0), new THREE.Vector3(-0.15, 0.28, 0),
    new THREE.Vector3(0.15, 0.28, 0), new THREE.Vector3(0.2, 0.1, 0),
  ])
  mesh(new THREE.TubeGeometry(handle, 12, 0.016, 4, false), grain, basket)
  const harvest = material("#657b50")
  const contents = new THREE.Group()
  for (const x of [-0.08, 0, 0.08]) ellipsoid(contents, [x, 0.07, 0], [0.06, 0.035, 0.08], harvest)
  basket.add(contents)
  root.add(basket)
  basket.visible = false
  const picked = ellipsoid(sockets.rightHand, [0, -0.02, 0], [0.045, 0.035, 0.045], harvest)
  picked.name = "gathered-item"
  picked.visible = false
  const pillow = new THREE.Group()
  pillow.name = "sleep-pillow"
  pillow.position.set(0, 0.05, -(b.headCenter - (b.headCenter + b.headHeight) / 2 - 0.03) - 0.08)
  const bundled = recipe.design.walkStyle === "Devotional"
  for (let i = 0; i < 9; i++) {
    const straw = mesh(new THREE.BoxGeometry(bundled ? 0.36 : 0.42, 0.03, 0.04), grain, pillow,
      [Math.sin(i * 2) * (bundled ? 0.01 : 0.025), bundled ? (i % 3) * 0.025 : 0, (Math.floor(i / 3) - 1) * (bundled ? 0.08 : 0.11)])
    straw.rotation.y = bundled ? 0 : Math.sin(i) * 0.35
  }
  if (bundled) for (const x of [-0.085, 0.085]) {
    const tie = mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 8), beltMaterial, pillow, [x, 0.025, 0])
    tie.rotation.y = Math.PI / 2
  }
  root.add(pillow)
  pillow.visible = false
  const snores = new THREE.Group()
  snores.name = "sleep-zzz"
  const zShape = new THREE.Shape()
  zShape.moveTo(-0.5, 0.5); zShape.lineTo(0.5, 0.5); zShape.lineTo(0.5, 0.28)
  zShape.lineTo(-0.15, -0.28); zShape.lineTo(0.5, -0.28); zShape.lineTo(0.5, -0.5)
  zShape.lineTo(-0.5, -0.5); zShape.lineTo(-0.5, -0.28); zShape.lineTo(0.15, 0.28)
  zShape.lineTo(-0.5, 0.28); zShape.closePath()
  const zMaterial = new THREE.MeshBasicMaterial({ color: "#bac8cf", side: THREE.DoubleSide, toneMapped: false })
  materials.push(zMaterial)
  for (let i = 0; i < 3; i++) {
    const z = mesh(new THREE.ShapeGeometry(zShape), zMaterial, snores, [i * 0.18, i * 0.16, 0])
    z.scale.setScalar(0.14 + i * 0.04)
  }
  root.add(snores)
  snores.visible = false
  // Solve both arm bones to a hand target in the upper body's coordinates.
  const reach = (limb: typeof limbs[number], target: Point3, palm = false, pole?: THREE.Vector3) => {
    const start = limb.shoulder.position.clone(), end = new THREE.Vector3(...target)
    end.y -= chest.position.y
    const axis = end.clone().sub(start)
    const lowerLength = b.forearmLength + (palm ? 0.04 * recipe.design.hands : 0)
    const distance = Math.max(Math.abs(b.upperArmLength - lowerLength) + 0.001, Math.min(axis.length(), b.upperArmLength + lowerLength - 0.001))
    if (axis.lengthSq() < 1e-12) axis.set(0, -1, 0)
    axis.normalize(); end.copy(start).addScaledVector(axis, distance)
    const along = (b.upperArmLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance)
    const bend = pole ? pole.clone().sub(start) : new THREE.Vector3(limb.side === "left" ? 1 : -1, -0.4, 0)
    bend.addScaledVector(axis, -bend.dot(axis))
    if (bend.lengthSq() < 1e-12) { bend.set(0, 0, 1); if (Math.abs(axis.z) > 0.9) bend.set(1, 0, 0); bend.addScaledVector(axis, -bend.dot(axis)) }
    bend.normalize()
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
  const drapedParts = [torso.geometry, ...ropeTails].map(geometry => ({
    geometry, positions: geometry.getAttribute("position"),
    rest: new Float32Array(geometry.getAttribute("position").array),
  }))
  const masks = new Map<string, THREE.MeshBasicMaterial>()
  const masked: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = []
  const baseParts = new Map<THREE.Material, number>([[skin, 1], [tunic, 3], [beltMaterial, 5], [hair, 2], [covering, 2], [undershirt, 3]])
  return {
    root, sockets,
    joints(): RigJoints {
      root.updateMatrixWorld(true)
      const point = (object: THREE.Object3D, local = new THREE.Vector3()) => root.worldToLocal(object.localToWorld(local)).toArray() as Point3
      const result: RigJoints = { pelvis: point(body), head: point(head) }
      const shoulders = limbs.map(limb => point(limb.shoulder))
      result.chest = shoulders[0].map((v, i) => (v + shoulders[1][i]) / 2) as Point3
      for (const limb of limbs) {
        const side = limb.side
        result[`${side}Shoulder`] = point(limb.shoulder)
        result[`${side}Elbow`] = point(limb.elbow)
        result[`${side}Hand`] = point(side === "left" ? sockets.leftHand : sockets.rightHand)
        result[`${side}Hip`] = point(limb.thigh, new THREE.Vector3(0, 0.5, 0))
        result[`${side}Knee`] = point(limb.thigh, new THREE.Vector3(0, -0.5, 0))
        result[`${side}Foot`] = point(limb.shin, new THREE.Vector3(0, -0.5, 0))
      }
      const staff = root.getObjectByName("walking-staff")
      if (staff?.visible && staff.children[0]) {
        const shaft = staff.children[0] as THREE.Mesh<THREE.CylinderGeometry>
        result.staffTip = point(shaft, new THREE.Vector3(0, -shaft.geometry.parameters.height / 2, 0))
        result.staffTop = point(shaft, new THREE.Vector3(0, shaft.geometry.parameters.height / 2, 0))
      }
      return result
    },
    view(row: number) {
      root.rotation.y = -row * Math.PI / 4
      snores.rotation.y = row * Math.PI / 4
      const facing = Math.sin(row * Math.PI / 4)
      for (const limb of limbs) {
        const depth = (limb.side === "left" ? 1 : -1) * facing
        const rear = depth < -0.1
        limb.rear = rear
        limb.armSkin.color.set(palette.skin).multiplyScalar(rear ? 0.8 : 1)
        limb.armTunic.color.set(limb.armColor).multiplyScalar(rear ? 0.85 : 1)
        // Screen depth controls edge priority; anatomical IDs stay fixed in diagnostics.
        for (const part of limb.armParts) part.userData.inkPart = part === limb.seam ? 3 :
          part === limb.hand ? (rear ? 2 : 10) : rear ? 2 : depth > 0.1 ? 9 : 8
        // Reduce sleeve bulk, not bone length, and lower the distant attachment.
        for (const part of [limb.sleeve, limb.forearm]) part.scale.set(rear ? 0.82 : 1, 1, rear ? 0.82 : 1)
        limb.hand.scale.set(0.043 * recipe.design.hands * (rear ? 0.88 : 1),
          0.06 * recipe.design.hands, 0.04 * recipe.design.hands * (rear ? 0.88 : 1))
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
      const swing = woodcuttingMotion(phase, chopping)
      const split = splittingMotion(phase)
      const tool = splittingTool(phase, b.shoulderHeight, b.hipHeight, splitGrip.toArray() as Point3)
      const splitRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(tool.pitch, tool.yaw, tool.roll, "YXZ"))
      const splitAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(splitRotation)
      const gathering = gatheringMotion(phase)
      const motion = walkBody(phase, clip)
      const devotional = recipe.design.walkStyle === "Devotional" && clip === "walk"
      headPivot.rotation.x = devotional ? 0.42 : 0
      headPivot.position.set(0, neckTop - waist + motion.headBob, 0)
      headPivot.rotation.y = -motion.chestYaw
      body.rotation.y = motion.hipYaw
      chest.rotation.y = motion.chestYaw - motion.hipYaw
      const seated = clip === "sitting", praying = clip === "praying"
      const felling = clip === "treeFelling", splitting = clip === "woodcutting"
      const sleep = clip === "sleeping", chop = felling || splitting, gather = clip === "gathering"
      const drop = pelvisHeight(phase, clip, b) - b.hipHeight
      // Slide the resting grip up the shaft as the hips lower, keeping the blade above the ground.
      const heldGrip = new THREE.Vector3(tool.x, tool.y + (drop - 0.02) * split.parked, tool.z)
      const shaftGrip = splitting ? THREE.MathUtils.clamp(axeHeadHeight - (heldGrip.y - (0.10 * chopping.axeScale + 0.035)) / chopping.axeScale, 0, 0.50) * split.parked : 0
      poseRoot.rotation.set(sleep ? -Math.PI / 2 : 0, sleep && female ? Math.PI / 2 : 0, 0)
      poseRoot.position.set(0, sleep ? female ? b.shoulderOffset + 0.06 : b.torsoTop * 0.78 : 0, sleep ? (b.headCenter + b.headHeight) / 2 + 0.03 : 0)
      body.position.y = b.hipHeight + drop
      body.rotation.x = gather ? 0.18 + gathering.reach * 0.3 : felling ? 0.10 : splitting ? split.lean : praying ? 0.12 + wave * 0.025 : sleep ? wave * 0.008 : seated ? 0.035 * wave : 0
      body.rotation.y = felling ? swing.twist : splitting ? split.twist : motion.hipYaw
      if (splitting) headPivot.rotation.x = -body.rotation.x * 0.65
      headPivot.rotation.y = felling ? -swing.twist * 0.55 : splitting ? -split.twist * 0.6 : -motion.chestYaw
      basket.visible = gather
      picked.visible = gather && gathering.holding
      contents.visible = gather && gathering.deposited
      pillow.visible = snores.visible = sleep
      snores.position.set(0.08, 0.55 + phase % 1 * 0.1, pillow.position.z)
      axe.visible = chop
      log.visible = splitting
      replacement.visible = splitting
      replacement.position.copy(supplyPosition).lerp(loadedPosition, split.logTravel)
      replacement.position.y += Math.sin(split.logTravel * Math.PI) * 0.20
      impact.visible = splitting && split.impact
      axeImpact.visible = felling ? swing.impact : splitting && split.impact
      glint.visible = felling ? swing.glint : splitting && split.glint
      trail.visible = felling ? swing.striking : splitting && split.striking
      for (const { half, side } of logHalves) {
        const tilt = split.falling * Math.PI / 2
        const groundedY = 0.19 * Math.cos(tilt) + 0.14 * Math.sin(tilt)
        // Gravity pulls the opened halves off the block; their cut faces finish upwards.
        half.position.set(side * split.falling * 0.42 / chopping.logScale,
          groundedY - log.position.y / chopping.logScale * split.falling ** 2,
          -split.falling * 0.16 / chopping.logScale)
        half.rotation.z = -side * tilt
      }
      for (const { geometry, positions, rest } of drapedParts) {
        for (let i = 0; i < positions.count; i++) {
          const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2]
          const weight = Math.max(0, (waist - y) / (waist - b.tunicHem))
          // Let the torso ride over the supporting leg while long hems remain
          // ankle-length. The cloth lengthens below the waist, not at the neck.
          const standingY = longGarment && !sleep ? y - drop * Math.min(1, weight) : y
          // The robe and hanging rope ends drape together over bent knees.
          const drapeZ = z + ((seated ? 0.48 : praying || gather ? 0.19 : 0) * weight) +
            (longGarment && (clip === "walk" || clip === "carrying" || clip === "procession") ? wave * 0.035 * recipe.design.stride * weight * weight : 0)
          const groundY = b.hipHeight + (0.035 - body.position.y + drapeZ * (geometry === torso.geometry ? torso.scale.z : 1) * Math.sin(body.rotation.x)) / Math.cos(body.rotation.x)
          if (longGarment && chop && y < waist) {
            // Spread the garment over the wider stance, keeping its hem planted as the torso twists.
            const xScale = geometry === torso.geometry ? torso.scale.x : 1
            const zScale = geometry === torso.geometry ? torso.scale.z : 1
            const w = Math.min(1, weight)
            const point = new THREE.Vector3(rest[i * 3] * xScale * (1 + 0.45 * w), y - b.hipHeight - drop * w, drapeZ * zScale)
            point.applyQuaternion(new THREE.Quaternion().slerp(body.quaternion.clone().invert(), w))
            positions.setXYZ(i, point.x / xScale, point.y + b.hipHeight, point.z / zScale)
          } else {
            positions.setX(i, rest[i * 3])
            positions.setY(i, seated || praying || gather ? Math.max(y, 0.07 - drop, groundY) : standingY)
            positions.setZ(i, drapeZ)
          }
          const twist = (motion.chestYaw - motion.hipYaw) * Math.max(0, Math.min(1,
            (y - waist) / (b.chestHeight - waist)))
          const depthScale = geometry === torso.geometry ? torso.scale.z : 1
          const currentX = positions.getX(i)
          const currentZ = positions.getZ(i) * depthScale
          positions.setX(i, currentX * Math.cos(twist) + currentZ * Math.sin(twist))
          positions.setZ(i, (-currentX * Math.sin(twist) + currentZ * Math.cos(twist)) / depthScale)
        }
        positions.needsUpdate = true
        geometry.computeVertexNormals()
      }
      for (const limb of limbs) {
        const leg = editedLeg(limb.side, phase, clip, b, recipe.design.poseEdits, poseRoot.quaternion.clone().invert())
        bone(limb.thigh, leg.hip, leg.knee)
        bone(limb.shin, leg.knee, leg.ankle)
        limb.foot.position.set(leg.ankle[0], leg.ankle[1] - b.ankleHeight + b.footHeight / 2, leg.ankle[2] + b.footLength * 0.22)
        limb.foot.rotation.y = chop ? (limb.side === "left" ? 1 : -1) * 0.22 : 0
        limb.shoulder.position.y = b.shoulderHeight - waist - (limb.rear ? 0.045 : 0)
        const seamStart = limb.seamStart.clone()
        seamStart.y -= waist
        const seamVector = limb.shoulder.position.clone().sub(seamStart)
        limb.seam.position.copy(seamStart).add(limb.shoulder.position).multiplyScalar(0.5)
        limb.seam.scale.set(limb.rear ? 0.82 : 1,
          seamVector.length() / Math.max(0.001, new THREE.Vector3((limb.side === "left" ? 1 : -1) * b.shoulderOffset, b.shoulderHeight, 0).sub(limb.seamStart).length()),
          limb.rear ? 0.82 : 1)
        limb.seam.quaternion.setFromUnitVectors(up, seamVector.normalize())
        limb.shoulder.rotation.set(armAngle(limb.side, phase, clip) * recipe.design.armSwing, 0,
          (limb.side === "left" ? 1 : -1) * THREE.MathUtils.degToRad(recipe.design.armAngle))
        const elbowSwing = clip === "walk" ? (1 - Math.cos(phase * Math.PI * 2 +
          (limb.side === "left" ? 0 : Math.PI) - 0.35)) * 0.14 * recipe.design.armSwing : 0
        limb.elbow.rotation.set(-THREE.MathUtils.degToRad(recipe.design.elbowBend) - elbowSwing, 0, 0)
        const sign = limb.side === "left" ? 1 : -1
        limb.hand.position.set(0, -b.forearmLength - (chop ? 0.04 : 0.025) * recipe.design.hands, 0)
        limb.hand.scale.set(chop ? 0.065 : 0.043, chop ? 0.055 : 0.06, chop ? 0.060 : 0.04).multiplyScalar(recipe.design.hands)
        limb.hand.quaternion.identity()
        if (recipe.design.walkingStick && (clip === "walk" || clip === "idle") && limb.side === "right") {
          const { grip } = staffMotion(phase, b, clip === "walk", recipe.design.poseEdits)
          root.updateMatrixWorld(true)
          const target = chest.worldToLocal(root.localToWorld(new THREE.Vector3(...grip)))
          target.y += chest.position.y
          reach(limb, target.toArray() as Point3, true)
          root.updateMatrixWorld(true)

        }
        else if (devotional) reach(limb, [sign * 0.018, waist - b.hipHeight + 0.045 + sign * 0.015, 0.30])
        else if (praying) reach(limb, [sign * 0.035, b.chestHeight - b.hipHeight, 0.33])
        else if (felling) {
          // Carry the two-handed grip with the chest as it twists, within both arms' reach.
          const target = new THREE.Vector3(Math.sin(swing.twist) * 0.28,
            b.shoulderHeight - 0.22, Math.cos(swing.twist) * 0.28)
          target.add(new THREE.Vector3(Math.sin(swing.yaw), 0, Math.cos(swing.yaw))
            .multiplyScalar(sign * gripSpacing * chopping.axeScale / 2))
          target.sub(body.position).applyQuaternion(body.quaternion.clone().invert())
          reach(limb, target.toArray() as Point3, true)
        } else if (splitting) {
          const target = heldGrip.clone()
          if (limb.side === "left") {
            target.addScaledVector(splitAxis, gripSpacing * chopping.axeScale)
            const handLog = replacement.position.clone().add(logHold)
            const resting = new THREE.Vector3(0.36, b.hipHeight + 0.10, 0.20)
            resting.lerp(handLog, split.reachLog)
            target.lerp(resting, split.release)
          }
          target.sub(body.position).applyQuaternion(body.quaternion.clone().invert())
          reach(limb, target.toArray() as Point3, true)
        } else if (clip === "hoisting" || clip === "procession") {
          const lift = clip === "procession" ? 1 : Math.min(1, phase * 16 / 15)
          const eased = lift * lift * (3 - 2 * lift)
          const low = new THREE.Vector3(sign * 0.2, 0.15, 0.34)
          // Arms rise beside the head, using the same two-bone solver and sockets.
          const high = new THREE.Vector3(sign * b.shoulderOffset,
            b.shoulderHeight - b.hipHeight + b.upperArmLength + b.forearmLength - 0.015, 0.04)
          reach(limb, low.lerp(high, eased).toArray() as Point3, true)
        } else if (clip === "carrying") reach(limb, [sign * 0.2, 0.15, 0.34])
        else if (gather) {
          const target = limb.side === "left" ? new THREE.Vector3(b.legOffset, 0.26, 0.34) :
            new THREE.Vector3(-0.43, 0.23, 0.3).lerp(new THREE.Vector3(-0.14, 0.09, 0.74), gathering.reach)
          target.sub(body.position).applyQuaternion(body.quaternion.clone().invert())
          reach(limb, target.toArray() as Point3)
        }
        else if (seated) reach(limb, [sign * 0.21, 0.02, 0.30])
        else if (sleep) reach(limb, bundled ? [-sign * 0.035, 0.08, 0.23 + sign * 0.02] :
          female ? [sign * 0.055, 0.42, 0.25] : [sign * 0.09, 0.22, 0.24])
        const handOffset = poseOffset(recipe.design.poseEdits, clip, limb.side === "left" ? "leftHand" : "rightHand", phase)
        const elbowOffset = poseOffset(recipe.design.poseEdits, clip, limb.side === "left" ? "leftElbow" : "rightElbow", phase)
        if ([...handOffset, ...elbowOffset].some(v => v !== 0)) {
          root.updateMatrixWorld(true)
          const handSocket = limb.side === "left" ? sockets.leftHand : sockets.rightHand
          const hand = root.worldToLocal(handSocket.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...handOffset))
          const elbow = root.worldToLocal(limb.elbow.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...elbowOffset))
          const target = chest.worldToLocal(root.localToWorld(hand))
          target.y += chest.position.y
          const pole = chest.worldToLocal(root.localToWorld(elbow))
          reach(limb, target.toArray() as Point3, true, pole)
        }
        if (recipe.design.walkingStick && (clip === "walk" || clip === "idle") && limb.side === "right") {
          root.updateMatrixWorld(true)
          const grip = sockets.rightHand.getWorldPosition(new THREE.Vector3())
          const palm = grip.clone().add(new THREE.Vector3(0, 0.026, 0))
          limb.hand.position.copy(limb.elbow.worldToLocal(palm))
          const orientation = root.getWorldQuaternion(new THREE.Quaternion()).multiply(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
          limb.hand.quaternion.copy(limb.elbow.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation))
        }
      }
      root.updateMatrixWorld(true)
      const headOffset = new THREE.Vector3(...poseOffset(recipe.design.poseEdits, clip, "head", phase))
      const parent = headPivot.parent!
      const zero = parent.worldToLocal(root.localToWorld(new THREE.Vector3()))
      headPivot.position.add(parent.worldToLocal(root.localToWorld(headOffset)).sub(zero))
      root.updateMatrixWorld(true)
      roadAccessories.pose(clip, phase)
      if (chop) {
        const toolRotation = felling
          ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), swing.yaw + Math.PI / 2)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2))
          : splitRotation
        // The blade stays vertical at contact, independently of the character's forward bend.
        const desired = root.getWorldQuaternion(new THREE.Quaternion()).multiply(toolRotation)
        axe.quaternion.copy(sockets.rightHand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired))
        axe.position.set(0, -shaftGrip * chopping.axeScale, 0).applyQuaternion(axe.quaternion)
        axe.updateMatrixWorld(true)
      }
      // Long garments cover bent legs too; expose only the toes below the draped hem.
      const hemHeight = longGarment && (seated || praying || gather) ? 0.08 :
        seated || praying || gather || (chop && !longGarment) ? 10 : b.tunicHem + (longGarment ? 0 : drop) + 0.012
      hemPlane.set(new THREE.Vector3(0, -1, 0), hemHeight)
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
      roadAccessories.dispose()
      for (const mask of masks.values()) mask.dispose()
      for (const geometry of geometries) geometry.dispose()
      for (const m of materials) m.dispose()
      for (const name of SOCKET_NAMES) sockets[name].clear()
    },
  }
}
