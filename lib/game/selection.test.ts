import { afterEach, describe, expect, it, vi } from "vitest"
import { Group, OrthographicCamera, Raycaster, Sprite, Vector2 } from "three"
import { useBuildStore } from "./build-store"
import { useCameraStore, type Selection } from "./camera-store"
import { markPerson, markSelectionScenery, prioritizePeople, selectElement, selectionObjectId } from "./selection"
import { buildingObjectId, pileObjectId, RELIC_OBJECT_ID, residentObjectId, travelerObjectId, treeObjectId, wildlifeObjectId } from "./render/outline"

const objects = {
  buildings: [{ id: "hovel" }, { id: "workshop-1" }],
  travelers: [{ id: 41 }, { id: 9 }],
  monks: [{ id: 72 }, { id: 18 }],
  piles: [{ id: "pile-a" }, { id: "pile-b" }],
}
const selections: Selection[] = [
  { kind: "tree", id: 6 }, { kind: "building", id: "workshop-1" },
  { kind: "traveler", id: 9 }, { kind: "monk", id: 18 },
  { kind: "pile", id: "pile-b" }, { kind: "relic" }, { kind: "animal", id: 12 },
]

afterEach(() => {
  useCameraStore.getState().select(null)
  useBuildStore.getState().reset()
})

describe("shared selection", () => {
  it.each(selections)("toggles $kind and replaces the previous selection", (candidate) => {
    const event = { delta: 0, stopPropagation: vi.fn() }
    useCameraStore.getState().select({ kind: "tree", id: 999 })
    selectElement(candidate, event)
    expect(useCameraStore.getState().selection).toEqual(candidate)
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    selectElement(candidate, event)
    expect(useCameraStore.getState().selection).toBeNull()
  })

  it.each(selections)("ignores drags and active building tools for $kind", (candidate) => {
    const previous: Selection = { kind: "tree", id: 999 }
    useCameraStore.getState().select(previous)
    const event = { delta: 7, stopPropagation: vi.fn() }
    selectElement(candidate, event)
    useBuildStore.getState().setTool("workshop")
    selectElement(candidate, { ...event, delta: 0 })
    expect(useCameraStore.getState().selection).toEqual(previous)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it("maps stable game identities to distinct rendered IDs", () => {
    const ids = selections.map((selection) => selectionObjectId(selection, objects))
    expect(ids).toEqual([
      treeObjectId(2, 6), buildingObjectId(1), travelerObjectId(1),
      residentObjectId(1), pileObjectId(1), RELIC_OBJECT_ID, wildlifeObjectId(12),
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(selectionObjectId({ kind: "pile", id: "pile-b" }, { ...objects, piles: [objects.piles[1]] })).toBe(pileObjectId(0))
  })

  it("picks the person before the scenery standing in front of them", () => {
    const person = { userData: {} as Record<string, unknown>, parent: null }
    markPerson(person)
    const walker = { object: { userData: {}, parent: person }, distance: 9 }
    const hat = { object: { userData: {}, parent: person }, distance: 10 }
    const tree = { userData: {} as Record<string, unknown>, parent: null }
    markSelectionScenery(tree)
    const crown = { object: { userData: {}, parent: tree }, distance: 4 }
    const trunk = { object: { userData: {}, parent: tree }, distance: 6 }
    expect(prioritizePeople([crown, walker, trunk, hat])).toEqual([walker, hat, crown, trunk])
  })

  it("leaves hits alone when people are not involved", () => {
    const crown = { object: { userData: {}, parent: null }, distance: 4 }
    const trunk = { object: { userData: {}, parent: null }, distance: 6 }
    markSelectionScenery(crown.object)
    markSelectionScenery(trunk.object)
    const hits = [crown, trunk]
    expect(prioritizePeople(hits)).toBe(hits)
    const person = { userData: {} as Record<string, unknown>, parent: null }
    markPerson(person)
    const people = [{ object: { userData: {}, parent: person }, distance: 1 }]
    expect(prioritizePeople(people)).toBe(people)
  })

  it.each([false, true])("picks a building before its occupants (batched: %s)", (batched) => {
    const person = { userData: {} }
    markPerson(person)
    const occupant = { object: { parent: person }, distance: 9 }
    const building = { object: { visible: !batched, userData: { batchedPickTarget: batched } }, distance: 6 }
    const tree = { object: { userData: {} }, distance: 3 }
    markSelectionScenery(tree.object)
    expect(prioritizePeople([tree, building, occupant])).toEqual([building, occupant, tree])
  })

  it("keeps exposed people selectable in front of buildings and through scenery", () => {
    const person = { userData: {} }
    markPerson(person)
    const walker = { object: { parent: person }, distance: 5 }
    const building = { object: {}, distance: 9 }
    const environment = { object: { userData: {} }, distance: 2 }
    markSelectionScenery(environment.object)
    expect(prioritizePeople([environment, walker, building])).toEqual([walker, building, environment])
  })

  it("does not pass clicks through other unmarked objects to people", () => {
    const person = { userData: {} }
    markPerson(person)
    const walker = { object: { parent: person }, distance: 5 }
    const prop = { object: {}, distance: 2 }
    const hits = [prop, walker]
    expect(prioritizePeople(hits)).toBe(hits)
  })

  it("ignores hidden scenery and characters, including visible children of hidden layers", () => {
    const hiddenLayer = { visible: false, parent: null }
    const person = { visible: true, userData: {} as Record<string, unknown>, parent: hiddenLayer }
    markPerson(person)
    const walker = { object: { visible: true, parent: person } }
    const roof = { object: { visible: false, parent: null } }
    const tree = { object: { visible: true, parent: hiddenLayer } }
    const ground = { object: { visible: true, parent: null } }
    expect(prioritizePeople([walker, roof, tree, ground])).toEqual([ground])
    hiddenLayer.visible = true
    expect(prioritizePeople([ground, tree, walker])).toEqual([ground, tree, walker])
  })

  it("clears the effect when a selected identity is gone", () => {
    expect(selectionObjectId(null, objects)).toBe(0)
    expect(selectionObjectId({ kind: "building", id: "gone" }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "traveler", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "monk", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "pile", id: "gone" }, objects)).toBe(0)
  })

  it("picks a batched building through its source mesh while respecting hidden layers", () => {
    const layer = { visible: true, parent: null }
    const roof = { object: { visible: false, userData: { batchedPickTarget: true }, parent: layer } }
    expect(prioritizePeople([roof])).toEqual([roof])
    layer.visible = false
    expect(prioritizePeople([roof])).toEqual([])
    layer.visible = true
    roof.object.userData.batchedPickTarget = false
    expect(prioritizePeople([roof])).toEqual([])
  })

  it.each([false, true])("keeps the full transport sprite clickable through scenery (batched: %s)", (batched) => {
    const layer = new Group(), transport = new Group(), cart = new Sprite()
    layer.add(transport); transport.add(cart)
    markPerson(transport)
    cart.userData.batchedPickTarget = true
    cart.visible = !batched
    cart.scale.set(3, 3, 1)
    layer.updateMatrixWorld(true)
    const camera = new OrthographicCamera(-2, 2, 2, -2, .1, 20)
    camera.position.z = 10
    camera.updateMatrixWorld(true)
    const raycaster = new Raycaster()
    // Click away from the axle/driver, on the outer part of the cart sprite.
    raycaster.setFromCamera(new Vector2(.6, .3), camera)
    const hits = raycaster.intersectObject(cart)
    expect(hits).toHaveLength(1)
    const tree = { object: { userData: {} }, distance: 2 }
    markSelectionScenery(tree.object)
    expect(prioritizePeople([tree, ...hits])).toEqual([...hits, tree])

    // Hidden transport poses (such as a deployed vendor sprite) and the
    // Characters display preference must still suppress the original target.
    transport.visible = false
    expect(prioritizePeople(hits)).toEqual([])
    transport.visible = true
    layer.visible = false
    expect(prioritizePeople(hits)).toEqual([])
    layer.visible = true
    expect(prioritizePeople(hits)).toEqual(hits)
  })

  it("lets a figure's drawn texels beat another figure's click volume in front", () => {
    const figure = (name: string) => { const root = { userData: {} }; markPerson(root); return { name, userData: {}, parent: root } }
    const volumeA = { object: figure("character-hit-target"), distance: 1 }
    const spriteB = { object: figure("traveler"), distance: 2 }
    const wall = { object: { userData: {} }, distance: 1.5 }
    const volumeC = { object: figure("character-hit-target"), distance: 3 }
    const cart = { object: figure("cart"), distance: 4 }
    expect(prioritizePeople([volumeA, spriteB])).toEqual([spriteB, volumeA])
    expect(prioritizePeople([volumeA, spriteB, volumeC, cart])).toEqual([spriteB, cart, volumeA, volumeC])
    // Surfaces between them still occlude, and volumes alone keep their order.
    expect(prioritizePeople([volumeA, wall, spriteB])).toEqual([volumeA, wall, spriteB])
    expect(prioritizePeople([volumeA, volumeC])).toEqual([volumeA, volumeC])
    expect(prioritizePeople([spriteB, volumeC])).toEqual([spriteB, volumeC])
  })
})
