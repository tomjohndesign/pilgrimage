import * as THREE from "three"
import { TRANSPORT, CART_WIDTH_SCALE, CART_WHEEL_X, type Cargo, type CartMode } from "./assets"
import { stallLayout, KEEPER_SEAT } from "./stall"
import { model } from "./geometry"
export { createAnimalRig } from "./animal-rig"

/** Shared source for transport atlases and merged, world-grounded stalls. */
export function createCartRig(cargo: Cargo, mode: CartMode, compact = false) {
  const layout = stallLayout(compact || mode === "hand" ? "hand" : "horse")
  const itemCount = compact || mode === "hand" ? 3 : 6
  const loaded: THREE.Object3D[][] = [], spread: THREE.Object3D[][] = []
  const m = model(), wood = "#65513b", edge = "#393025"
  const boards = ["#65513b", "#574834", "#766149", "#514533", "#6a5841"]
  for (let i = 0; i < 5; i++) {
    const board = m.box([(i - 2) * 0.31, 0.64, (i % 2) * 0.025], [0.305, 0.13, 1.78 - (i % 3) * 0.035], boards[i])
    board.rotation.z = (i % 3 - 1) * 0.012
  }
  for (const x of [-0.76, 0.76]) {
    for (let i = 0; i < 3; i++) {
      const board = m.box([x, 0.76 + i * 0.17, (i % 2) * 0.02], [0.09, 0.155, 1.82 - i * 0.023], boards[i + 1])
      board.rotation.x = (i - 1) * 0.018
      for (const z of [-0.55, 0.18]) m.box([x + Math.sign(x) * 0.049, 0.76 + i * 0.17, z], [0.008, 0.014, 0.33 - i * 0.05], edge)
    }
    for (const z of [-0.76, 0.77]) {
      const post = m.box([x, 0.88, z], [0.14, 0.61, 0.12], edge); post.rotation.z = Math.sign(x) * 0.035
      for (let i = 0; i < 3; i++) m.bar([x - 0.075, 0.98 + i * 0.025, z + 0.07], [x + 0.075, 0.99 + i * 0.025, z + 0.07], 0.013, "#9b8861")
    }
    const brace = m.box([x + Math.sign(x) * 0.07, 0.87, 0], [0.08, 0.09, 1.54], "#4a3e2e"); brace.rotation.x = 0.18
  }
  for (const z of [-0.84, 0.84]) for (let i = 0; i < 3; i++) {
    const plank = m.box([0, 0.76 + i * 0.17, z], [1.55 - i * 0.02, 0.15, 0.1], boards[i]); plank.rotation.z = (i - 1) * 0.012
  }
  m.bar([-0.94, 0.46, 0], [0.94, 0.46, 0], 0.08, edge)
  const wheels = [-CART_WHEEL_X, CART_WHEEL_X].map(x => {
    const wheel = new THREE.Group(); wheel.position.set(x, TRANSPORT.wheelRadius, 0); m.root.add(wheel)
    wheel.name = "solid-wood-wheel"
    const disc = m.mesh(new THREE.CylinderGeometry(TRANSPORT.wheelRadius, TRANSPORT.wheelRadius, 0.17, 40), "#514331", [0, 0, 0], wheel); disc.rotation.z = Math.PI / 2
    // Plank seams and pegged cross-battens on a continuous solid wooden disc.
    for (const face of [-0.089, 0.089]) {
      for (const y of [-0.24, -0.015, 0.21]) {
        const half = Math.sqrt(0.445 ** 2 - y ** 2)
        m.bar([face, y, -half], [face, y, half], 0.012, "#2f291f", wheel)
      }
      for (const z of [-0.23, 0.23]) {
        m.box([face, 0, z], [0.025, 0.64, 0.075], "#776147", wheel)
        for (const y of [-0.24, 0.23]) m.box([face * 1.2, y, z], [0.025, 0.04, 0.04], edge, wheel)
      }
      m.box([face, 0, 0], [0.06, 0.14, 0.14], "#3e3427", wheel)
    }
    return wheel
  })
  const animal = mode === "donkey" || mode === "horse"
  const tip = mode === "shop" ? 0.95 : 2.18
  // Only hand carts and parked shops carry rigid handles.
  if (!animal) for (const sign of [-1, 1]) {
    m.bar([sign * 0.65, 0.6, 0.5], [sign * 0.295 / CART_WIDTH_SCALE, 0.61, tip], 0.045, wood).name = "cart-handle"
  }
  if (animal) {
    const bench = m.box([0, 1.20, 1.05], [1.6, 0.18, 0.90], "#766149")
    bench.name = "driver-bench"
    for (const x of [-0.62, 0.62]) {
      m.box([x, 0.9, 1.05], [0.14, 0.6, 0.14], edge)
      m.bar([x, 0.7, 1.15], [x, 0.91, 1.85], 0.04, edge)
    }
    m.box([0, 0.89, 1.72], [1.4, 0.10, 0.40], wood).name = "driver-footboard"
    m.box([0, 1.48, 0.64], [1.58, 0.25, 0.10], wood).name = "driver-backrest"
  }
  for (let i = 0; i < itemCount; i++) {
    const start = m.root.children.length
    const x = itemCount === 3 ? 0 : (i % 2 - 0.5) * 0.65, z = (itemCount === 3 ? i : Math.floor(i / 2)) * 0.48 - 0.48
    if (cargo === "produce") {
      m.box([x, 1.04, z], [0.6, 0.18, 0.43], "#83704d")
      for (let j = 0; j < 3; j++) m.oval([x + (j - 1) * 0.17, 1.2, z], [0.1, 0.105, 0.12], i % 2 ? "#799347" : "#a74b39")
    } else if (cargo === "bread") {
      m.oval([x, 1.16, z], [0.23, 0.15, 0.21], "#d3aa64")
      for (const dz of [-0.08, 0.07]) m.box([x, 1.303, z + dz], [0.21, 0.012, 0.035], "#f0d196")
    } else if (cargo === "pottery") {
      m.oval([x, 1.22, z], [0.23, 0.3, 0.22], i % 2 ? "#78929a" : "#b66b4c")
      m.mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.14, 12), "#b66b4c", [x, 1.5, z])
      m.mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.015, 12), edge, [x, 1.58, z])
    } else {
      m.box([x, 1.12, z], [0.58, 0.2, 0.42], ["#78939e", "#a34d44", "#d0b879"][i % 3])
      m.box([x, 1.23, z], [0.07, 0.02, 0.42], "#ded0ac")
    }
    loaded.push(m.root.children.slice(start))
    loaded.at(-1)!.forEach(part => { part.userData.cargoItem = i })
  }
  const roofStart = m.root.children.length
  if (mode === "shop") {
    for (const x of [-0.86, 0.86]) for (const z of [-0.86, 0.86]) m.bar([x, 0.65, z], [x + 0.045 * Math.sign(z), z < 0 ? 2.17 : 1.99, z], 0.042, edge)
    // A patched, sagging wool/linen cover, tied to rough poles; no shop stripes or trim.
    for (let i = 0; i < 5; i++) {
      const x0 = -1 + i * 0.4, x1 = x0 + 0.41
      const vertices: number[] = [], indices: number[] = []
      for (let j = 0; j <= 4; j++) {
        const z = -1 + j * 0.5, y = 2.16 - (z + 1) * 0.09 - Math.sin(j / 4 * Math.PI) * 0.15 + (i % 2) * 0.025
        vertices.push(x0, y, z, x1, y - 0.02, z + (j === 4 ? (i % 3) * 0.04 : 0))
        if (j) { const k = j * 2; indices.push(k - 2, k, k - 1, k - 1, k, k + 1) }
      }
      const cover = new THREE.BufferGeometry(); cover.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); cover.setIndex(indices); cover.computeVertexNormals()
      const cloth = m.mesh(cover, ["#827255", "#8d7d5e", "#75694f", "#88775b", "#79694e"][i], [0, 0, 0]); cloth.material.side = THREE.DoubleSide
    }
    m.box([-0.38, 2.025, 0.1], [0.34, 0.018, 0.42], "#605a46").rotation.x = 0.08
    for (const x of [-0.55, 0.55]) m.bar([x, 0.05, 0.74], [x, 0.65, 0.74], 0.045, edge)
  }
  const cover = m.root.children.slice(roofStart)
  // Resize source geometry only. The driver and ground display retain their
  // proportions, and hand-cart grips stay at the same attachment points.
  const chassis = new THREE.Group()
  chassis.name = "cart-chassis"
  for (const part of [...m.root.children]) chassis.add(part)
  chassis.scale.x = CART_WIDTH_SCALE
  m.root.add(chassis)
  const displayStart = m.root.children.length
  if (mode === "shop") {
    m.box([layout.display.x, 0.035, layout.display.z], [layout.display.width, 0.055, layout.display.length], "#7f7156")
    for (let i = 0; i < itemCount; i++) {
      const start = m.root.children.length
      const x = layout.display.x, z = layout.display.z + (i - (itemCount - 1) / 2) * 0.72
      if (cargo === "textiles") m.box([x, 0.15, z], [0.75, 0.2, 0.62], ["#78939e", "#a34d44", "#b8a16b"][i % 3])
      else if (cargo === "pottery") {
        m.oval([x, 0.28, z], [0.22, 0.25, 0.22], i % 2 ? "#b66b4c" : "#78929a")
        m.mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 10), "#b66b4c", [x, 0.54, z])
      } else {
        m.box([x, 0.12, z], [0.72, 0.18, 0.58], "#65513b")
        for (const dx of cargo === "bread" ? [0] : [-0.18, 0, 0.18]) m.oval([x + dx, 0.28, z], cargo === "bread" ? [0.16, 0.1, 0.23] : [0.14, 0.13, 0.14], cargo === "bread" ? "#c39857" : i % 2 ? "#a74b39" : "#799347")
      }
      spread.push(m.root.children.slice(start))
      spread.at(-1)!.forEach(part => { part.userData.displayItem = i })
    }
    m.box([KEEPER_SEAT.x, 0.025, KEEPER_SEAT.z], [0.46, 0.04, 0.5], "#7f7156")
    m.bar([layout.sign.x, 0, layout.sign.z], [layout.sign.x + 0.06, 1.25, layout.sign.z], 0.055, "#493d2a")
    m.box([layout.sign.x, 1.02, layout.sign.z], [0.72, 0.43, 0.09], "#756044").rotation.z = -0.08
    // Simple wares pictogram carved into the sign; readable at native pixels.
    m.box([layout.sign.x, 1.02, layout.sign.z + 0.055], [0.32, 0.20, 0.015], "#c0ae81")
    m.box([layout.sign.x, 1.17, layout.sign.z + 0.055], [0.16, 0.10, 0.015], "#c0ae81")
  }
  const display = m.root.children.slice(displayStart)
  return { ...m, pose(phase: number, opening = 1) {
    wheels.forEach(w => { w.rotation.x = phase * Math.PI * 2 })
    const raised = Math.min(1, opening * 2)
    cover.forEach(part => { part.visible = opening > 0; part.scale.y = 0.38 + raised * 0.62 })
    display.forEach(part => { part.visible = opening >= 0.45 })
    for (let i = 0; i < itemCount; i++) {
      const unloaded = mode === "shop" && opening >= 0.5 + (i + 1) / itemCount * 0.5
      loaded[i].forEach(part => { part.visible = !unloaded })
      spread[i]?.forEach(part => { part.visible = unloaded })
    }
  } }
}
