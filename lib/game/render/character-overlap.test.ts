import { expect, it } from "vitest"
import * as THREE from "three"
import { CharacterBatch, type CharacterBatchEntry } from "./character-batch"
import { CharacterOverlap, characterOverlapBounds } from "./character-overlap"

function fixture() {
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100)
  camera.position.set(0, 5, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const entries: CharacterBatchEntry[] = [], batches: CharacterBatch[] = []
  const add = (z: number, size = 1, batchable = true) => {
    const anchor = new THREE.Group(), pose = new THREE.Group()
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() })), ids = new THREE.Sprite()
    anchor.position.z = z; anchor.add(pose); pose.add(sprite, ids)
    sprite.scale.set(size, size, 1); sprite.renderOrder = entries.length + 1
    const entry: CharacterBatchEntry = { sprite, ids, overlapAnchor: anchor, batchable,
      depthBias: { value: 0 }, id: new THREE.Vector3((entries.length + 1) / 255, 0, 0), ground: { value: new THREE.Vector4(0, 1, 0, 0) },
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
  return { add, update, dispose, camera }
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


it("sorts cart, driver, passengers and animal independently in every camera/path direction", () => {
  const f = fixture()
  try {
    const cart = f.add(0, 2.5), animal = f.add(0, 2), walker = f.add(0)
    const driver = f.add(0, 2.5), passenger = f.add(0, 2.5)
    const entries = [cart, animal, walker, driver, passenger]
    // Connected parts may have the same selection identity, never a shared rank.
    animal.id.copy(cart.id); driver.id.copy(cart.id)
    cart.railPart = 1; animal.railPart = 2; driver.railPart = 3; passenger.railPart = 4
    driver.railSeat = { x: 0, z: .35 }; passenger.railSeat = { x: -.12, z: -.15 }
    for (let view = 0; view < 8; view++) for (let direction = 0; direction < 32; direction++) {
      const yaw = view * Math.PI / 4, heading = direction * Math.PI / 16
      f.camera.position.set(10 * Math.sin(yaw), 5, 10 * Math.cos(yaw)); f.camera.lookAt(0, 0, 0); f.camera.updateMatrixWorld()
      for (const entry of entries) entry.overlapAnchor!.userData.heading = heading
      animal.overlapAnchor!.position.set(Math.sin(heading) * .7, 0, Math.cos(heading) * .7)
      walker.overlapAnchor!.position.set(Math.sin(heading) * .2 + .01, 0, Math.cos(heading) * .2)
      const biases = f.update(entries)
      const bounds = entries.map(entry => characterOverlapBounds(entry, f.camera))
      const order = entries.map((_, i) => i).sort((a, b) => bounds[b].distance - bounds[a].distance || bounds[a].order - bounds[b].order)
      for (let i = 1; i < order.length; i++) {
        const a = order[i], b = order[i - 1]
        expect(bounds[a].far - biases[a]).toBeLessThan(bounds[b].near - biases[b])
      }
      expect(f.update([passenger, walker, animal])).toEqual(biases)
      expect(f.update()).toEqual(biases)
    }
  } finally { f.dispose() }
})

it("uses seat ground position without moving the registered artwork", () => {
  const f = fixture()
  try {
    const cart = f.add(0, 2.5), driver = f.add(0, 2.5)
    driver.railSeat = { x: 0, z: .35 }
    f.update()
    const a = characterOverlapBounds(cart, f.camera), b = characterOverlapBounds(driver, f.camera)
    expect(b.distance).toBeLessThan(a.distance)
    expect([a.left, a.right, a.top, a.bottom]).toEqual([b.left, b.right, b.top, b.bottom])
    driver.overlapAnchor!.userData.heading = Math.PI
    f.update()
    expect(characterOverlapBounds(driver, f.camera).distance).toBeGreaterThan(a.distance)
  } finally { f.dispose() }
})
