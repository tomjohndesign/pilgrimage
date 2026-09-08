import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { CHARACTER_COLOR_LAYER, CHARACTER_ID_LAYER, tagPixelCharacters, withoutPixelCharacters } from "./pixel-characters"
import { batchSourceRoot, updateBatchSourceVisibility, batchedSourceRoots } from "./batch-source-visibility"
import { OUTLINE_ID_LAYER, SELECTED_CHARACTER_LAYER } from "./outline"

describe("separate character rendering", () => {
  it("omits hidden ancestor subtrees and resumes tagging on the first visible frame", () => {
    const scene = new THREE.Scene(), visibility = new THREE.Group(), root = new THREE.Group(), sprite = new THREE.Sprite()
    root.add(sprite); visibility.add(root); scene.add(visibility)
    visibility.visible = false
    expect(tagPixelCharacters([root], scene)).toBe(false)
    expect(sprite.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
    visibility.visible = true
    expect(tagPixelCharacters([root], scene)).toBe(true)
    expect(sprite.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
    visibility.visible = false
    expect(tagPixelCharacters([root], scene)).toBe(false)
  })

  it("skips an empty character pass despite resident hit volumes, lights, IDs and batch capacity", () => {
    const scene = new THREE.Scene(), root = new THREE.Group()
    const hit = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ visible: false }))
    const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 8)
    const ids = new THREE.Sprite(); ids.layers.set(OUTLINE_ID_LAYER)
    batch.count = 0
    root.add(hit, batch, ids, new THREE.AmbientLight()); scene.add(root)
    expect(tagPixelCharacters([root], scene)).toBe(false)
    batch.count = 1
    expect(tagPixelCharacters([root], scene)).toBe(true)
    batch.geometry.setDrawRange(0, 0)
    expect(tagPixelCharacters([root], scene)).toBe(false)
    hit.geometry.dispose(); hit.material.dispose(); batch.geometry.dispose(); batch.material.dispose(); ids.material.dispose()
  })

  it("includes sprites, carried geometry, and lights without changing picking or ID identity", () => {
    const scene = new THREE.Scene(), root = new THREE.Group()
    const sprite = new THREE.Sprite(), cart = new THREE.Mesh(), id = new THREE.Mesh(), world = new THREE.Mesh(), light = new THREE.AmbientLight()
    sprite.layers.enable(SELECTED_CHARACTER_LAYER)
    id.layers.set(OUTLINE_ID_LAYER)
    root.add(sprite, cart, id); scene.add(root, world, light)
    tagPixelCharacters([root], scene)
    for (const object of [sprite, cart, light]) {
      expect(object.layers.isEnabled(0)).toBe(true)
      expect(object.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
    }
    expect(sprite.layers.isEnabled(SELECTED_CHARACTER_LAYER)).toBe(true)
    expect(id.layers.isEnabled(CHARACTER_ID_LAYER)).toBe(true)
    expect(id.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
    expect(world.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
  })

  it("picks up newly mounted equipment and restores visibility even if rendering fails", () => {
    const scene = new THREE.Scene(), root = new THREE.Group(), hiddenRoot = new THREE.Group(), awning = new THREE.Group()
    hiddenRoot.visible = awning.visible = false
    root.add(awning); scene.add(root, hiddenRoot)
    tagPixelCharacters([root], scene)
    const gear = new THREE.Mesh(); root.add(gear)
    tagPixelCharacters([root], scene)
    expect(gear.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
    expect(() => withoutPixelCharacters([root, hiddenRoot], () => {
      expect(root.visible).toBe(false)
      expect(hiddenRoot.visible).toBe(false)
      throw new Error("render failed")
    })).toThrow("render failed")
    expect(root.visible).toBe(true)
    expect(hiddenRoot.visible).toBe(false)
    expect(awning.visible).toBe(false)
  })

  it("tags previously culled equipment on the frame it becomes visible", () => {
    const scene = new THREE.Scene(), root = new THREE.Group(), person = new THREE.Group(), gear = new THREE.Mesh()
    person.visible = false
    person.add(gear); root.add(person); scene.add(root)
    tagPixelCharacters([root], scene)
    expect(gear.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(false)
    person.visible = true
    tagPixelCharacters([root], scene)
    expect(gear.layers.isEnabled(CHARACTER_COLOR_LAYER)).toBe(true)
  })

  it("restores nested and repeated roots after a render error and reuses the next scope safely", () => {
    const outer = new THREE.Group(), inner = new THREE.Group()
    withoutPixelCharacters([outer, outer], () => {
      expect(() => withoutPixelCharacters([outer, inner], () => { throw new Error("nested render") })).toThrow("nested render")
      expect(outer.visible).toBe(false)
      expect(inner.visible).toBe(true)
    })
    expect(outer.visible).toBe(true)
    withoutPixelCharacters([inner], () => expect(inner.visible).toBe(false))
    expect(inner.visible).toBe(true)
  })
})

it("prunes only empty batch-source hierarchies, restoring them for simulation and picking", () => {
  const scene = new THREE.Scene(), unit = new THREE.Group(), pose = new THREE.Group()
  unit.name = "traveler-unit"
  const sprite = new THREE.Sprite(), ids = new THREE.Sprite(), gear = new THREE.Mesh()
  sprite.visible = ids.visible = gear.visible = false
  pose.add(sprite, ids); unit.add(pose, gear); scene.add(unit)
  expect(batchSourceRoot(sprite)).toBe(unit)
  updateBatchSourceVisibility(scene, [unit])
  expect([...batchedSourceRoots(scene)]).toEqual([unit])
  withoutPixelCharacters(batchedSourceRoots(scene), () => expect(unit.visible).toBe(false))
  expect(unit.visible).toBe(true)
  // Selected sprites, carried logs, carts and other individually rendered gear
  // retain their entire hierarchy, even when a sibling is batched.
  for (const visible of [sprite, gear]) {
    visible.visible = true
    updateBatchSourceVisibility(scene, [unit])
    expect([...batchedSourceRoots(scene)]).toEqual([])
    visible.visible = false
  }
})

it("prunes batched people with invisible click materials while keeping moving hit volumes current", () => {
  const scene = new THREE.Scene(), unit = new THREE.Group(), pose = new THREE.Group()
  unit.name = "traveler-unit"
  const sprite = new THREE.Sprite(), hit = new THREE.Mesh(new THREE.BoxGeometry(.8, 1, .8), new THREE.MeshBasicMaterial({ visible: false }))
  sprite.visible = false
  pose.add(sprite); unit.add(pose, hit); scene.add(unit)
  const ray = new THREE.Raycaster()
  for (const x of [1, 4, -3]) {
    unit.position.set(x, 0, 0)
    updateBatchSourceVisibility(scene, [unit])
    expect([...batchedSourceRoots(scene)]).toEqual([unit])
    withoutPixelCharacters(batchedSourceRoots(scene), () => expect(unit.visible).toBe(false))
    ray.set(new THREE.Vector3(x, 0, 3), new THREE.Vector3(0, 0, -1))
    expect(ray.intersectObject(hit).length).toBeGreaterThan(0)
  }
  // Material visibility doesn't hide descendants; visible attached graphics
  // still prevent pruning even below an invisible-material parent mesh.
  hit.add(new THREE.Mesh())
  updateBatchSourceVisibility(scene, [unit])
  expect([...batchedSourceRoots(scene)]).toEqual([])
  hit.geometry.dispose(); hit.material.dispose()
})
