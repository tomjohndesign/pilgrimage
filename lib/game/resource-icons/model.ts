import * as THREE from "three"
import { EARLY_MATERIALS } from "../building-art/materials"
import { createWoodLogGeometry, WOOD_LOG } from "../wood-log"
import { PERSON_PRESETS } from "../base-person/design"
import type { IllustratedIcon } from "./design"

/** Small still-life models built from the game's roundwood, rural materials and character palette. */
export function resourceIconModel(kind: IllustratedIcon) {
  const root = new THREE.Group()
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Map<string, THREE.Material>()
  function material(color: string, highlight = false) {
    const key = `${color}:${highlight}`
    if (!materials.has(key)) materials.set(key, highlight ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }))
    return materials.get(key)!
  }
  function mesh(geometry: THREE.BufferGeometry, colors: string | string[], position: [number, number, number]) {
    geometries.add(geometry)
    const object = new THREE.Mesh(geometry, Array.isArray(colors) ? colors.map(color => material(color)) : material(colors))
    object.position.set(...position); root.add(object); return object
  }
  const box = (size: [number, number, number], position: [number, number, number], color: string) => mesh(new THREE.BoxGeometry(...size), color, position)
  const oval = (size: [number, number, number], position: [number, number, number], color: string) => {
    const object = mesh(new THREE.SphereGeometry(1, 12, 8), color, position); object.scale.set(...size); return object
  }
  const star = (radius: number, position: [number, number, number], color: string) => {
    const shape = new THREE.Shape()
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, r = i % 2 ? radius * .24 : radius
      if (i) shape.lineTo(Math.sin(angle) * r, Math.cos(angle) * r)
      else shape.moveTo(0, r)
    }
    shape.closePath()
    return mesh(new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: false }), color, position)
  }
  if (kind === "wood") {
    for (const [x, y] of [[-.14, .14], [.14, .14], [0, .38]]) {
      const log = mesh(createWoodLogGeometry(), [WOOD_LOG.bark, WOOD_LOG.endGrain, WOOD_LOG.endGrain], [x, y, 0])
      log.rotation.x = Math.PI / 2; log.scale.y = 1.8
      for (const z of [-.347, .347]) {
        const ring = mesh(new THREE.TorusGeometry(.07, .009, 3, 10), EARLY_MATERIALS.wood, [x, y, z])
        ring.rotation.z = .2
      }
    }
  } else if (kind === "food") {
    root.userData.frontFacing = true
    // A broad red cut and pale bone remain distinct at 16 px.
    const bone = mesh(new THREE.CylinderGeometry(.052, .06, .44, 8), "#eee1b9", [.18, .23, .02]); bone.rotation.z = -.6
    oval([.085, .065, .065], [.3, .08, .02], "#fff2ce")
    oval([.065, .08, .07], [.36, .13, .02], "#fff2ce")
    oval([.27, .32, .24], [-.05, .53, 0], "#8d382e").rotation.z = -.45
    oval([.235, .25, .04], [-.09, .58, .195], "#e2b795").rotation.z = -.45
    oval([.193, .206, .046], [-.09, .58, .221], "#b94e42").rotation.z = -.45
    oval([.053, .064, .018], [-.06, .58, .267], "#fff2ce")
    oval([.05, .08, .018], [-.19, .64, .263], "#de8069").rotation.z = -.5
  } else if (kind === "gold") {
    // Quiet faces and a short rim reflection keep each coin legible at HUD sizes.
    for (const [x, z, count] of [[-.22, .12, 2], [.18, -.13, 3], [.25, .3, 1]]) {
      for (let i = 0; i < count; i++) {
        mesh(new THREE.CylinderGeometry(.21, .21, .063, 16), ["#b47a10", "#ffcf40", "#79500b"], [x, .034 + i * .09, z])
      }
      const rim = mesh(new THREE.TorusGeometry(.203, .021, 3, 8, Math.PI * .38), "#ffe891", [x, .066 + (count - 1) * .09, z])
      rim.material = material("#fff4bd", true)
      rim.rotation.set(Math.PI / 2, 0, Math.PI * .2)
    }
  } else if (kind === "population") {
    root.userData.frontFacing = true
    // Portrait silhouettes use the cast's skin, hair and cloth without tiny limbs.
    for (const [index, preset] of [PERSON_PRESETS.Stout, PERSON_PRESETS.Female].entries()) {
      const x = index ? .23 : -.23, y = index ? .04 : 0, z = index ? .05 : -.05
      oval([.255, .235, .15], [x, .24 + y, z], preset.tunicColor)
      box([.12, .12, .12], [x, .43 + y, z], preset.skinColor)
      oval([.145, .185, .135], [x, .62 + y, z], preset.hairColor)
      oval([.126, .143, .105], [x, .59 + y, z + .065], preset.skinColor)
      if (index) {
        const coif = mesh(new THREE.SphereGeometry(.157, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), preset.coveringColor, [x, .65 + y, z]); coif.scale.y = .85
      }
    }
  } else if (kind === "stone") {
    box([.36, .24, .33], [-.2, .12, .06], "#84897f").rotation.y = -.06
    box([.36, .24, .33], [.19, .12, .08], "#a4a89a").rotation.y = .08
    box([.4, .25, .31], [-.015, .375, .01], "#b5b9ac").rotation.y = -.12
  } else if (kind === "faith") {
    root.userData.frontFacing = true
    // One uninterrupted Latin-cross face: square arms, a clear head and a long stem.
    const cross = new THREE.Shape()
    cross.moveTo(-.085, 0)
    for (const [x, y] of [[.085, 0], [.085, .68], [.36, .68], [.36, .84], [.085, .84], [.085, 1.1], [-.085, 1.1], [-.085, .84], [-.36, .84], [-.36, .68], [-.085, .68]]) cross.lineTo(x, y)
    cross.closePath()
    mesh(new THREE.ExtrudeGeometry(cross, { depth: .09, bevelEnabled: false }), ["#b08957", EARLY_MATERIALS.darkWood], [0, 0, 0])
  } else if (kind === "build") {
    root.userData.frontFacing = true
    box([.105, .68, .11], [0, .32, 0], EARLY_MATERIALS.paleWood)
    box([.54, .23, .25], [0, .64, 0], EARLY_MATERIALS.wood)
    box([.055, .24, .26], [-.24, .64, 0], WOOD_LOG.endGrain)
    box([.055, .24, .26], [.24, .64, 0], WOOD_LOG.endGrain)
    root.rotation.z = -.45
  } else if (kind === "map" || kind === "new-map") {
    root.userData.frontFacing = true
    for (const [index, x] of [-.3, 0, .3].entries()) {
      const fold = box([.31, .65, .025], [x, .35, index === 1 ? 0 : .035], index === 1 ? "#e8d4a0" : "#c6ad78"); fold.rotation.y = index === 0 ? -.25 : index === 2 ? .25 : 0
    }
    const path: Array<[number, number]> = [[-.31, .2], [-.2, .25], [-.09, .3], [.02, .41], [.13, .45], [.25, .5]]
    for (const [x, y] of path) box([.08, .035, .015], [x, y, .09], "#785637").rotation.z = .5
    for (const [x, y] of [[-.24, .52], [.24, .2]]) mesh(new THREE.ConeGeometry(.075, .13, 3), "#657b50", [x, y, .09])
    if (kind === "new-map") {
      box([.38, .12, .065], [.25, .68, .12], "#315847")
      box([.12, .38, .065], [.25, .68, .12], "#315847")
    }
  } else if (kind === "visits") {
    root.userData.frontFacing = true
    for (const [x, z] of [[-.18, .14], [.18, -.13]]) {
      oval([.11, .045, .2], [x, .06, z], "#785637")
      box([.15, .07, .12], [x, .045, z + .255], "#503b2b")
      oval([.065, .012, .11], [x - .025, .1, z - .03], "#b08957")
    }
  } else if (kind === "renown") {
    root.userData.frontFacing = true
    // Dark cut edges and pale centres stay separate from the restrained halo.
    for (const [radius, x, y] of [[.3, 0, .43], [.12, .4, .76], [.1, -.38, .12]]) {
      star(radius, [x, y, 0], "#684818")
      const face = star(radius * .76, [x, y, .038], "#ffcf40")
      face.material = material("#fff4bd", true)
    }
  } else if (kind === "music") {
    root.userData.frontFacing = true
    // A broad beamed-note symbol, carved in pale wood. No strings or tiny details.
    const notes = new THREE.Shape()
    notes.moveTo(-.18, .16)
    for (const [x, y] of [[-.18, .85], [.4, 1], [.4, .29], [.27, .29], [.27, .78], [-.05, .7], [-.05, .16]]) notes.lineTo(x, y)
    notes.closePath()
    mesh(new THREE.ExtrudeGeometry(notes, { depth: .075, bevelEnabled: false }), ["#d6b57b", EARLY_MATERIALS.darkWood], [0, 0, 0])
    for (const [x, y] of [[-.22, .15], [.23, .28]]) {
      oval([.18, .115, .065], [x, y, .04], "#d6b57b").rotation.z = .3
    }
  } else if (kind === "play") {
    root.userData.frontFacing = true
    const shape = new THREE.Shape(); shape.moveTo(-.22, .05); shape.lineTo(.34, .4); shape.lineTo(-.22, .75); shape.closePath()
    mesh(new THREE.ExtrudeGeometry(shape, { depth: .13, bevelEnabled: false }), "#d6b57b", [0, 0, 0])
  } else if (kind === "pause") {
    root.userData.frontFacing = true
    for (const x of [-.18, .18]) box([.16, .68, .13], [x, .34, 0], "#d6b57b")
  }
  return { root, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) } }
}
