import * as THREE from "three"
import { DEFAULT_DESIGN, personRecipe } from "../base-person/design"
import { createBasePersonRig } from "../base-person/rig"

type Point = [number, number, number]
let carving: number[] | undefined

/** Static wooden corpus: the shared character head with a sculpted crucifix pose.
 * Coordinates are relative to a unit-height cross, facing forward along +Z.
 * Prepared once as geometry; this never invokes the character sprite baker.
 */
export function crucifixFigureVertices(): readonly number[] {
  if (carving) return carving
  const rig = createBasePersonRig(personRecipe({ ...DEFAULT_DESIGN,
    hairStyle: "Long", beard: true, hat: "None", satchel: false,
    walkingStick: false, lute: false,
  }))
  const vertices: number[] = [], point = new THREE.Vector3()
  const append = (geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) => {
    const positions = geometry.getAttribute("position"), indices = geometry.index
    for (let i = 0; i < (indices?.count ?? positions.count); i++) {
      point.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(matrix)
      vertices.push(point.x, point.y, point.z)
    }
  }
  const shape = (geometry: THREE.BufferGeometry, position: Point, scale: Point = [1, 1, 1], rotation = new THREE.Quaternion()) => {
    try { append(geometry, new THREE.Matrix4().compose(new THREE.Vector3(...position), rotation, new THREE.Vector3(...scale))) }
    finally { geometry.dispose() }
  }
  const oval = (position: Point, scale: Point) => shape(new THREE.SphereGeometry(1, 8, 6), position, scale)
  const limb = (from: Point, to: Point, startRadius: number, endRadius: number) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a)
    shape(new THREE.CylinderGeometry(endRadius, startRadius, direction.length(), 8),
      a.add(b).multiplyScalar(.5).toArray() as Point, [1, 1, 1],
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
  }
  // Elliptical sections carve a continuous chest, narrowing at the waist. The
  // shallow front relief catches light without introducing painted skin tones.
  const torso: number[] = []
  const sections = [
    [-.115, .053, .033, .112], [-.07, .047, .028, .12],
    [-.005, .043, .028, .125], [.055, .064, .037, .12],
    [.115, .077, .037, .11], [.15, .064, .03, .105], [.178, .027, .024, .105],
  ]
  const ringPoint = (section: number[], angle: number): Point =>
    [Math.sin(angle) * section[1], section[0], section[3] + Math.cos(angle) * section[2]]
  for (let row = 0; row < sections.length - 1; row++) for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6
    const p = ringPoint(sections[row], a), q = ringPoint(sections[row], b)
    const r = ringPoint(sections[row + 1], b), s = ringPoint(sections[row + 1], a)
    torso.push(...p, ...q, ...r, ...p, ...r, ...s)
  }
  const torsoGeometry = new THREE.BufferGeometry()
  torsoGeometry.setAttribute("position", new THREE.Float32BufferAttribute(torso, 3))
  shape(torsoGeometry, [0, 0, 0])
  for (const sign of [-1, 1]) {
    oval([sign * .033, .094, .139], [.032, .025, .013])
    limb([sign * .014, .154, .126], [sign * .065, .14, .121], .007, .008)
    // The body hangs below the hands, which remain attached to the crossbeam.
    const shoulder: Point = [sign * .069, .143, .106]
    const elbow: Point = [sign * .195, .17, .09]
    const wrist: Point = [sign * .306, .205, .078]
    oval(shoulder, [.029, .026, .027])
    limb(shoulder, elbow, .025, .017)
    oval(elbow, [.019, .018, .019])
    limb(elbow, wrist, .019, .011)
    oval([sign * .327, .207, .078], [.025, .016, .012])
    limb([sign * .314, .199, .082], [sign * .323, .184, .085], .006, .004)
  }
  limb([0, .161, .108], [-.006, .21, .119], .022, .021)

  try {
    // Keep the game's carved facial proportions, long hair and beard, but bow
    // the complete head onto the chest instead of using an upright villager.
    rig.pose(0, "idle")
    const head = rig.root.getObjectByName("head-pivot")!
    head.updateWorldMatrix(true, true)
    const inverse = head.matrixWorld.clone().invert()
    const bounds = new THREE.Box3()
    head.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return
      const positions = object.geometry.getAttribute("position")
      const local = inverse.clone().multiply(object.matrixWorld)
      for (let i = 0; i < positions.count; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(local))
    })
    const centre = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3())
    const bowed = new THREE.Quaternion().setFromEuler(new THREE.Euler(.32, -.08, -.22))
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(-.013, .249, .128), bowed,
      new THREE.Vector3(.092 / size.x, .137 / size.y, .085 / size.z))
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
    head.traverseVisible(object => {
      if (object instanceof THREE.Mesh) append(object.geometry, transform.clone().multiply(inverse).multiply(object.matrixWorld))
    })
    // A small projecting nose survives the same flat-shaded wood treatment.
    shape(new THREE.ConeGeometry(.009, .028, 4), [-.011, .255, .174], [1, 1, 1],
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -.22)))
  } finally { rig.dispose() }

  // Close-set legs with a slight bend lift the knees away from the timber;
  // ankles converge and one bare foot rests just ahead of the other.
  for (const [hip, knee, ankle] of [
    [[-.031, -.137, .112], [-.034, -.255, .151], [-.008, -.369, .104]],
    [[.031, -.137, .108], [.021, -.252, .144], [.009, -.366, .122]],
  ] as [Point, Point, Point][]) {
    limb(hip, knee, .029, .02)
    oval(knee, [.02, .023, .022])
    limb(knee, ankle, .019, .01)
    oval([ankle[0], -.382, ankle[2] + .016], [.014, .023, .031])
  }
  // Short, asymmetric wrapped loincloth, with actual carved folds and a knot.
  const cloth = new THREE.LatheGeometry([
    new THREE.Vector2(.052, -.105), new THREE.Vector2(.059, -.12),
    new THREE.Vector2(.064, -.166), new THREE.Vector2(.049, -.186),
  ].reverse(), 12)
  shape(cloth, [0, 0, .112], [1, 1, .68])
  limb([-.047, -.113, .139], [.047, -.137, .146], .009, .01)
  oval([.048, -.132, .148], [.014, .013, .013])
  limb([-.033, -.129, .15], [-.022, -.176, .148], .005, .003)
  limb([.006, -.134, .154], [.014, -.181, .146], .005, .003)
  const tail = new THREE.BufferGeometry()
  tail.setAttribute("position", new THREE.Float32BufferAttribute([
    .04, -.135, .158, .032, -.195, .151, .057, -.177, .146,
    .04, -.135, .152, .057, -.177, .14, .032, -.195, .145,
  ], 3))
  shape(tail, [0, 0, 0])
  carving = vertices
  return carving
}
