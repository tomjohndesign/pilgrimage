import * as THREE from "three"
import { makeRng } from "../rng"
import type { WaterSourceKind } from "./assets"

/** Early medieval Britain: timber lining and stave buckets are attested;
 * the above-ground curb is an interpretive reconstruction. See assets/WATER_SOURCES.md. */
export function waterSourceModel(kind: WaterSourceKind, seed = 42, unlit = false) {
  const root = new THREE.Group(), geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const rng = makeRng(seed)
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    geometries.push(geometry)
    const material = unlit ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.push(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z); root.add(mesh)
    return mesh
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) =>
    add(new THREE.BoxGeometry(w, h, d), color, x, y, z)
  const stone = (x: number, z: number, r: number) => {
    const mesh = add(new THREE.IcosahedronGeometry(1, 0), "#93917a", x, r * .38, z)
    mesh.scale.set(r, r * .65, r * .8); mesh.rotation.y = rng() * 6
  }
  if (kind === "well") {
    // Dark shaft inside a low, accessible stacked-timber curb. No roof or pump.
    box(0, .012, 0, .95, .024, .95, "#222e2a")
    const timber = ["#756047", "#877152", "#7d674b", "#95805d"]
    for (let course = 0; course < 4; course++) {
      const y = .075 + course * .125
      for (const side of [-1, 1]) {
        box(side * .49, y, 0, .13, .12, 1.13, timber[course])
        box(0, y, side * .49, .88, .12, .13, timber[(course + 1) % 4])
      }
    }
    // Slightly wider coping timbers, exposed end grain and peg heads.
    for (const side of [-1, 1]) {
      box(side * .49, .535, 0, .19, .07, 1.18, "#a08a63")
      box(0, .535, side * .49, .81, .07, .19, "#95805c")
      for (const z of [-.48, .48]) box(side * .49, .576, z, .035, .015, .035, "#554a37")
    }
    // Open stave bucket resting on a corner; wooden hoops, dark interior.
    const bx = .43, bz = .39, bottom = .57
    add(new THREE.CylinderGeometry(.105, .085, .02, 12), "#342f23", bx, bottom, bz)
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6
      const stave = box(bx + Math.cos(angle) * .105, bottom + .115, bz + Math.sin(angle) * .105,
        .053, .23, .026, i % 2 ? "#ab9165" : "#94784f")
      stave.rotation.y = Math.PI / 2 - angle
    }
    for (const h of [.045, .185]) {
      const hoop = add(new THREE.TorusGeometry(.115, .012, 4, 12), "#63523b", bx, bottom + h, bz)
      hoop.rotation.x = Math.PI / 2
    }
    // Rope bail and loose coil on the curb, continuing down into the shaft.
    const bail = add(new THREE.TorusGeometry(.105, .012, 4, 12, Math.PI), "#c0ab79", bx, bottom + .23, bz)
    bail.rotation.y = Math.PI / 2
    for (let i = 0; i < 3; i++) {
      const coil = add(new THREE.TorusGeometry(.065 + i * .024, .011, 4, 12), "#baa476", -.16, .582, .49)
      coil.rotation.x = Math.PI / 2
    }
    box(-.16, .58, .38, .022, .022, .2, "#baa476")
    box(-.16, .31, .29, .022, .53, .022, "#a58e62")
    stone(-.58, .54, .11); stone(.56, -.57, .09)
  } else {
    // Nested irregular opaque surfaces keep depth exact and water at ground level.
    const outline = Array.from({ length: 18 }, (_, i) => {
      const a = i * Math.PI * 2 / 18, r = .94 + rng() * .1
      return [Math.cos(a) * r, Math.sin(a) * r * .72] as const
    })
    const patch = (scale: number, y: number, color: string) => {
      const shape = new THREE.Shape()
      outline.forEach(([x, z], i) => i ? shape.lineTo(x * scale, -z * scale) : shape.moveTo(x * scale, -z * scale))
      shape.closePath()
      const mesh = add(new THREE.ShapeGeometry(shape), color, 0, y, 0)
      mesh.rotation.x = -Math.PI / 2
    }
    patch(1.1, .012, "#847657")
    patch(1, .02, "#5f6550")
    patch(.86, .028, "#526e67")
    patch(.7, .03, "#46615c")
    for (let i = 0; i < 7; i++) {
      const x = (rng() - .5) * 1.1, z = (rng() - .5) * .6
      box(x, .035, z, .10 + rng() * .15, .008, .018, i % 2 ? "#77928a" : "#67847b")
    }
    // Leave the near bank clear so a person can crouch to dip a vessel.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + i * Math.PI / 6
      stone(Math.cos(a) * .98, Math.sin(a) * .75, .08 + rng() * .055)
    }
    for (let i = 0; i < 12; i++) {
      const x = -.7 + rng() * 1.4, z = -.68 - rng() * .08, h = .13 + rng() * .18
      const blade = add(new THREE.ConeGeometry(.018, h, 3), i % 2 ? "#7d8953" : "#657547", x, h / 2, z)
      blade.rotation.z = (rng() - .5) * .4
    }
  }
  return { root, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) } }
}

/** Build menu and placement ghosts use the very geometry baked into the sprites. */
export function waterSourceParts(kind: WaterSourceKind): import("../building-art/geometry").BuildingPart[] {
  const model = waterSourceModel(kind, kind === "well" ? 42 : 73)
  try {
    model.root.updateMatrixWorld(true)
    return model.root.children.map((object, index) => {
      const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
      const vertices = Array.from(geometry.getAttribute("position").array).map((v, i) => i % 3 === 1 ? Math.max(0, v) : v)
      geometry.dispose()
      return { name: `water-source-${index}`, layer: "base", position: [0, 0, 0], vertices,
        color: `#${mesh.material.color.getHexString()}`, outline: false }
    })
  } finally { model.dispose() }
}
