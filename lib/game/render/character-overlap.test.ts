import { expect, it } from "vitest"
import * as THREE from "three"
import { CharacterBatch, type CharacterBatchEntry } from "./character-batch"
import { CharacterOverlap } from "./character-overlap"

function fixture() {
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100)
  camera.position.set(0, 5, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const entries: CharacterBatchEntry[] = [], batches: CharacterBatch[] = []
  const add = (z: number, size = 1, batchable = true, shared?: object) => {
    const anchor = new THREE.Group(), pose = new THREE.Group()
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() })), ids = new THREE.Sprite()
    anchor.position.z = z; anchor.add(pose); pose.add(sprite, ids)
    sprite.scale.set(size, size, 1); sprite.renderOrder = entries.length + 1
    const entry: CharacterBatchEntry = { sprite, ids, overlapAnchor: anchor, shared, batchable,
      depthBias: { value: 0 }, id: new THREE.Vector3(entries.length + 1, 0, 0), ground: { value: new THREE.Vector4(0, 1, 0, 0) },
      depth: { map: { value: new THREE.Texture() }, enabled: { value: true } } }
    entries.push(entry)
    return entry
  }
  const overlap = new CharacterOverlap()
  const update = (batched: CharacterBatchEntry[] = []) => {
    for (const entry of entries) entry.sprite.visible = entry.ids.visible = !batched.includes(entry)
    const batch = new CharacterBatch(entries[0], { value: .01 }, 1)
    batches.push(batch); batch.write(batched, camera)
    overlap.update(entries, [{ entries: batched }], camera)
    batch.writeBiases(batched)
    return entries.map(entry => entry.depthBias!.value)
  }
  const dispose = () => {
    batches.forEach(batch => batch.dispose())
    for (const entry of entries) { entry.sprite.material.map?.dispose(); entry.sprite.material.dispose(); entry.ids.material.dispose(); entry.depth.map.value?.dispose() }
  }
  return { add, update, dispose }
}

it("orders a custom cart among batched people, including selection and camera-side crossings", () => {
  const f = fixture()
  try {
    const back = f.add(-.02), person = f.add(0), cart = f.add(.02, 2.5, false)
    const batched = f.update([back, person])
    expect(batched[2]).toBeGreaterThan(batched[1])
    expect(f.update()).toEqual(batched)
    cart.overlapAnchor!.position.z = -.01
    const crossing = f.update([back, person])
    expect(crossing[1]).toBeGreaterThan(crossing[2])
  } finally { f.dispose() }
})

it("keeps a cart and individually selectable passengers together across batching changes", () => {
  const f = fixture()
  try {
    const back = f.add(-.02), assembly = {}, cart = f.add(0, 2.5, true, assembly)
    const passenger = f.add(0, 2.5, true, assembly), front = f.add(.02)
    for (const batch of [[back, cart, passenger, front], [back, cart, front], []]) {
      const biases = f.update(batch)
      expect(biases[1]).toBe(biases[2])
      expect(biases[1]).toBeGreaterThan(biases[0])
      expect(biases[3]).toBeGreaterThan(biases[1])
    }
  } finally { f.dispose() }
})

it("does not swap coincident figures when their animated planted-foot offsets cross", () => {
  const f = fixture()
  try {
    const first = f.add(0), second = f.add(0)
    f.update([first, second])
    for (const offset of [-.04, .04, -.03, .03]) {
      first.sprite.parent!.position.z = offset
      second.sprite.parent!.position.z = -offset
      const batched = f.update([first, second])
      expect(batched[0]).toBe(0); expect(batched[1]).toBeGreaterThan(0)
      expect(f.update()).toEqual(batched)
    }
    second.overlapAnchor!.position.z = 5
    expect(f.update()).toEqual([0, 0])
  } finally { f.dispose() }
})

it("keeps a hitched animal and cart relief together, releasing a grazing animal", () => {
  const f = fixture()
  try {
    let hitched = true
    const assembly = {}, cart = f.add(-.3, 2.5, false), animal = f.add(.3, 2), walker = f.add(.5)
    cart.shared = animal.shared = () => hitched ? assembly : undefined
    const joined = f.update([animal, walker])
    expect(joined[0]).toBe(joined[1])
    expect(joined[2]).toBeGreaterThan(joined[1])
    expect(f.update([walker])).toEqual(joined)
    hitched = false
    const released = f.update([animal, walker])
    expect(released[1]).toBeGreaterThan(released[0])
  } finally { f.dispose() }
})

it("uses one stable assembly anchor when selected layers are visited in a different order", () => {
  const f = fixture()
  try {
    const assembly = {}, cart = f.add(-.1, 2.5, true, assembly), rider = f.add(.1, 2.5, true, assembly)
    const walker = f.add(0)
    const expected = f.update([cart, rider, walker])
    expect(f.update([rider, walker])).toEqual(expected)
    expect(f.update([cart, walker])).toEqual(expected)
  } finally { f.dispose() }
})

it("orders a walker beside the animal by the animal's anchor, including selection", () => {
  const f = fixture()
  try {
    const assembly = {}, cart = f.add(-.3, 2.5, false, assembly), animal = f.add(.3, 2, true, assembly), walker = f.add(0)
    animal.overlapAnchor!.position.x = walker.overlapAnchor!.position.x = 3
    for (const batch of [[animal, walker], [walker], []]) {
      const biases = f.update(batch)
      expect(biases[0]).toBe(biases[1])
      expect(biases[1]).toBeGreaterThan(biases[2])
    }
    // Reverse the cart/animal depth without changing who meets the walker.
    cart.overlapAnchor!.position.z = .3; animal.overlapAnchor!.position.z = -.3
    const reversed = f.update([animal, walker])
    expect(reversed[2]).toBeGreaterThan(reversed[1])
  } finally { f.dispose() }
})
