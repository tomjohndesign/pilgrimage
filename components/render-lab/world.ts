import * as THREE from "three"
import { softenTreeLighting } from "@/lib/game/trees/lighting"
import { addSurfaceLighting } from "@/lib/game/render/lighting"
import { makeRng } from "@/lib/game/rng"
import { generateTree, TREE_SPECIES, type TreeSpeciesId } from "@/lib/game/trees/species"
import { lightOffsetForYaw } from "@/lib/game/render/iso"

export function litScene() {
  const scene = new THREE.Scene()
  const sun = addSurfaceLighting(scene)
  return { scene, sun }
}

export function lightScene(sun: THREE.DirectionalLight, yaw: number) {
  sun.position.set(...lightOffsetForYaw(yaw))
}

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], color: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color }))
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

/** Fixed seed and the game's tree definitions keep geometry identical in every view. */
export function createWorld() {
  const ground = litScene()
  const props: Array<ReturnType<typeof litScene> & { body: THREE.Group }> = []
  const rng = makeRng(42)
  box(ground.scene, [8.4, 0.25, 6.6], [0, -0.125, 0], "#657443")
  box(ground.scene, [8.4, 0.035, 2.85], [0, 0.0175, 0], "#9b8256")
  const flecks: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []]
  for (let i = 0; i < 110; i++) {
    const x = (rng() - 0.5) * 8.2
    const z = (rng() - 0.5) * 6.4
    const road = Math.abs(z) < 1.4
    const size = new THREE.Vector3(0.04 + rng() * 0.14, 0.012, 0.03 + rng() * 0.08)
    flecks[road ? 1 : 0].push(new THREE.Matrix4().compose(new THREE.Vector3(x, road ? 0.041 : 0.007, z), new THREE.Quaternion(), size))
  }
  // Keep four simultaneous views cheap enough to judge motion, not CPU stalls.
  flecks.forEach((matrices, i) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: i ? "#b19b71" : "#7c8850" }), matrices.length)
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
    ground.scene.add(mesh)
  })
  const prop = (x: number, z: number) => {
    const lit = litScene()
    const body = new THREE.Group()
    body.position.set(x, 0.04, z)
    lit.scene.add(body)
    props.push({ ...lit, body })
    return body
  }
  const tree = (id: TreeSpeciesId, x: number, z: number, scale: number) => {
    const def = TREE_SPECIES[id]
    const shape = generateTree(def, rng)
    const body = prop(x, z)
    body.scale.setScalar(scale)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(shape.trunkRadius * def.trunk.taper, shape.trunkRadius, shape.trunkHeight, 6), new THREE.MeshLambertMaterial({ color: def.trunk.color }))
    trunk.material.onBeforeCompile = softenTreeLighting
    trunk.position.y = shape.trunkHeight / 2
    body.add(trunk)
    for (const part of shape.crown) {
      const mesh = new THREE.Mesh(def.crown.shape === "cone" ? new THREE.ConeGeometry(1, 2, 7) : new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: new THREE.Color(def.crown.color).multiplyScalar(shape.crownShade), flatShading: true }))
      mesh.material.onBeforeCompile = softenTreeLighting
      mesh.position.set(part.x, part.y, part.z)
      mesh.scale.set(part.rx, part.ry, part.rz)
      mesh.rotation.y = part.yaw
      body.add(mesh)
    }
  }
  tree("oak", -0.8, 0.4, 1.25)
  tree("holly", 1.7, -1.6, 1.5)
  tree("birch", 3, 1.9, 1.2)
  const cottage = prop(-2.4, -2.15)
  box(cottage, [1.55, 0.85, 1.15], [0, 0.425, 0], "#cbb894")
  box(cottage, [1.8, 0.18, 1.4], [0, 0.94, 0], "#8a4b2f")
  box(cottage, [0.3, 0.55, 0.025], [0, 0.275, 0.58], "#4c3826")
  const fence = prop(1.5, 1.15)
  for (const x of [-0.65, 0, 0.65]) box(fence, [0.06, 0.65, 0.06], [x, 0.325, 0], "#705135")
  for (const y of [0.2, 0.48]) box(fence, [1.5, 0.045, 0.045], [0, y, 0], "#8a6947")
  return { ground, props }
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object instanceof THREE.InstancedMesh) object.dispose()
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => material.dispose())
    }
  })
}
