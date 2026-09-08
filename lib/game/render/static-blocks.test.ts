import { expect, it } from "vitest"
import * as THREE from "three"
import { cullStaticBlocks, registerStaticBlock, updateVisibleWorldMatrices } from "./static-blocks"

it("culls whole blocks, restores them after camera movement, and unregisters cleanly", () => {
  const scene = new THREE.Scene(), group = new THREE.Group()
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2)
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(50, 0, 0))
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(55, 0, 0))
  group.add(mesh); scene.add(group)
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100)
  camera.position.set(0, 0, 10); camera.updateMatrixWorld()
  const dispose = registerStaticBlock(scene, group)
  cullStaticBlocks(scene, camera)
  expect(group.visible).toBe(false)
  camera.position.x = 50; camera.updateMatrixWorld()
  cullStaticBlocks(scene, camera)
  expect(group.visible).toBe(true)
  camera.position.x = 0; camera.updateMatrixWorld()
  cullStaticBlocks(scene, camera)
  dispose()
  cullStaticBlocks(scene, camera)
  expect(group.visible).toBe(true)
  expect(group.matrixWorldAutoUpdate).toBe(true)
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose()
})

it("updates visible descendants when their parent moves and resumes hidden figures", () => {
  const scene = new THREE.Scene(), parent = new THREE.Group(), figure = new THREE.Group()
  scene.add(parent); parent.add(figure)
  figure.position.x = 2
  updateVisibleWorldMatrices(scene)
  expect(figure.matrixWorld.elements[12]).toBe(2)
  parent.visible = false; parent.position.x = 5
  updateVisibleWorldMatrices(scene)
  expect(figure.matrixWorld.elements[12]).toBe(2)
  parent.visible = true
  updateVisibleWorldMatrices(scene)
  expect(figure.matrixWorld.elements[12]).toBe(7)
})

it("restores inactive detail sources without exposing both tree representations", () => {
  const scene = new THREE.Scene(), group = new THREE.Group()
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial()
  const full = new THREE.InstancedMesh(geometry, material, 1), coarse = new THREE.InstancedMesh(geometry, material, 1)
  coarse.visible = false; group.add(full, coarse); scene.add(group)
  const unregister = registerStaticBlock(scene, group, true)
  full.visible = false
  unregister()
  expect(full.visible).toBe(true)
  expect(coarse.visible).toBe(false)
  full.dispose(); coarse.dispose(); geometry.dispose(); material.dispose()
})
