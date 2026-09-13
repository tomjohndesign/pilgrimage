import { expect, it } from "vitest"
import * as THREE from "three"
import { CharacterBatch, type CharacterBatchEntry } from "./character-batch"

it.each([false, true])("refreshes a remounted horse's pose before batching (compact %s)", compact => {
  const unit = new THREE.Group(), mount = new THREE.Group(), pose = new THREE.Group()
  const color = new THREE.Texture(), depth = new THREE.Texture()
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: color })), ids = new THREE.Sprite()
  unit.add(mount); mount.add(pose); pose.add(sprite, ids)
  sprite.scale.set(2, 2, 1)
  unit.position.set(2, 0, 3)
  unit.updateWorldMatrix(true, true)
  const entry: CharacterBatchEntry = { sprite, ids, ground: { value: new THREE.Vector4(0, 1, 0, 0) },
    depth: { map: { value: depth }, enabled: { value: true } }, id: new THREE.Vector3(1, 0, 0) }
  const batch = new CharacterBatch(entry, { value: .01 }, 1, compact), camera = new THREE.PerspectiveCamera()
  try {
    batch.write([entry], camera, true)
    mount.visible = false
    batch.write([], camera, true)
    // The mounted pose stays hidden during the shrine visit. On return, the
    // transport callback resolves its parent and changes its foot-contact
    // offset, but leaves the pose's world matrix for the renderer to update.
    unit.position.set(8, 2, -5)
    mount.visible = true
    mount.updateWorldMatrix(true, false)
    pose.position.set(.125, 0, -.25)
    entry.ground.value.w = -2
    sprite.visible = ids.visible = false // Source sprites are hidden by batching.
    batch.write([entry], camera, true)

    expect(batch.root.visible).toBe(true)
    expect(entry.anchorX).toBeCloseTo(8.125)
    expect(entry.anchorZ).toBeCloseTo(-5.25)
    const body = batch.root.children[0] as THREE.InstancedMesh
    const view = body.geometry.getAttribute("characterView")
    expect(view.getY(0)).toBeCloseTo(2)
    expect(view.getY(0) + body.geometry.getAttribute("characterGround").getW(0)).toBeCloseTo(0)
    expect(body.count).toBe(1)
  } finally {
    batch.dispose(); color.dispose(); depth.dispose(); sprite.material.dispose(); ids.material.dispose()
  }
})
