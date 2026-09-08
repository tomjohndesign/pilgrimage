import * as THREE from "three"
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { grassSurfaceColor } from "../render/ground-palette"
import { model, type Point } from "../transport/geometry"

/** A small turf bank with an open, earth-lined tunnel facing +Z.
 * Shared by the world and animal playground, in the rabbit rig's units.
 * The bank covers the existing underground path; its mouth stays at ground level.
 */
export function createBurrowRig(turfColor = grassSurfaceColor()) {
  const m = model(), vertices: number[] = [], colors: number[] = []
  const turf = [`#${turfColor.getHexString()}`]
  const earth = ["#75654a", "#79694e", "#706047", "#7d6c50"]
  function triangle(a: Point, b: Point, c: Point, color: string) {
    vertices.push(...a, ...b, ...c)
    const shade = new THREE.Color(color)
    for (let i = 0; i < 3; i++) colors.push(shade.r, shade.g, shade.b)
  }
  function strip(a: Point[], b: Point[], palette: string[]) {
    for (let i = 0; i < a.length - 1; i++) {
      triangle(a[i], b[i], a[i + 1], palette[i % palette.length])
      triangle(a[i + 1], b[i], b[i + 1], palette[(i + 1) % palette.length])
    }
  }
  // Uneven half arches give the bank real thickness without blocking the mouth.
  function arch(width: number, height: number, depth: number, lean = 0): Point[] {
    return Array.from({ length: 13 }, (_, i) => {
      const angle = i / 12 * Math.PI, rise = Math.sin(angle)
      const rough = 1 + .045 * Math.sin(i * 2.4)
      return [Math.cos(angle) * width * rough + .035 * rise,
        .014 + rise * height * rough, depth - rise * lean]
    })
  }
  const mouth = arch(.35, .40, .27, .14)
  const lip = arch(.42, .46, .24, .18)
  const brow = arch(.76, .56, -.03, .15)
  const crown = arch(.86, .39, -.53, .05)
  const heel = arch(.66, .10, -1.01)
  const base = arch(.40, 0, -1.27)
  strip(mouth, lip, earth)
  strip(lip, brow, turf)
  strip(brow, crown, turf)
  strip(crown, heel, turf)
  strip(heel, base, turf)

  // Recessed walls and a shadowed back, rather than a black disk on the lawn.
  const throat = arch(.29, .32, -.55)
  strip(throat, mouth, ["#493d2b", "#50422f", "#594a35"])
  for (let i = 0; i < throat.length - 1; i++) {
    triangle([0, .014, -.55], throat[i], throat[i + 1], "#30291e")
  }
  triangle([-.35, .015, .27], [.35, .015, .27], [-.29, .015, -.55], "#403222")
  triangle([.35, .015, .27], [.29, .015, -.55], [-.29, .015, -.55], "#403222")

  // A short, irregular apron of scraped soil, kept flat for planted feet.
  const apron: Point[] = [[-.35,.018,.18],[-.43,.018,.32],[-.46,.018,.53],
    [-.34,.018,.66],[-.13,.018,.73],[.08,.018,.77],[.30,.018,.69],
    [.44,.018,.53],[.42,.018,.36],[.35,.018,.18]]
  const soil = ["#756047", "#786349", "#705c43", "#7c664a"]
  for (let i = 0; i < apron.length - 1; i++) {
    triangle([0,.023,.42], apron[i], apron[i + 1], soil[i % soil.length])
  }

  // Coarse turf blades break the rim silhouette at the same native pixel scale
  // as the animals. Everything shares one vertex-coloured mesh/draw call.
  for (const [x, y, z] of [brow[3], brow[8], crown[6]]) {
    triangle([x-.07,y,z], [x+.04,y+.08,z-.025], [x+.02,y,z+.025], turf[0])
    triangle([x-.02,y,z+.035], [x-.08,y+.06,z+.06], [x+.07,y,z+.065], turf[0])
  }
  for (const [x, z, size] of [[-.43,.60,.045],[.37,.69,.035]]) {
    const top: Point = [x,.035,z]
    triangle([x-size,.016,z], top, [x,.016,z+size], "#7d6c50")
    triangle([x,.016,z+size], top, [x+size,.016,z], "#6b573e")
  }
  const faces = new THREE.BufferGeometry()
  faces.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
  faces.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  // Weld the turf surface so lighting rolls across the mound without dark ribs.
  const geometry = mergeVertices(faces)
  faces.dispose()
  geometry.computeVertexNormals()
  // Ease turf lighting toward the surrounding ground, especially at the skirt.
  // The tunnel keeps its full shading; the low bank should not read as a boulder.
  const normal = geometry.getAttribute("normal"), color = geometry.getAttribute("color")
  const position = geometry.getAttribute("position"), grass = new THREE.Color(turf[0])
  const softened = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < normal.count; i++) {
    if (Math.abs(color.getX(i) - grass.r) > 1e-6 || Math.abs(color.getY(i) - grass.g) > 1e-6) continue
    const blend = .55 + .4 * (1 - Math.min(1, position.getY(i) / .24))
    softened.fromBufferAttribute(normal, i).lerp(up, blend).normalize()
    normal.setXYZ(i, softened.x, softened.y, softened.z)
  }
  const bank = m.mesh(geometry, "#ffffff", [0, 0, 0])
  bank.material.vertexColors = true
  bank.material.side = THREE.DoubleSide
  return { ...m, geometry }
}
