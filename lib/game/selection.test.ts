import { afterEach, describe, expect, it, vi } from "vitest"
import { useBuildStore } from "./build-store"
import { useCameraStore, type Selection } from "./camera-store"
import { markPerson, prioritizePeople, selectElement, selectionObjectId } from "./selection"
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
    const crown = { object: { userData: {}, parent: null }, distance: 4 }
    const trunk = { object: { userData: {}, parent: null }, distance: 6 }
    expect(prioritizePeople([crown, walker, trunk, hat])).toEqual([walker, hat, crown, trunk])
  })

  it("leaves hits alone when people are not involved", () => {
    const crown = { object: { userData: {}, parent: null }, distance: 4 }
    const trunk = { object: { userData: {}, parent: null }, distance: 6 }
    const hits = [crown, trunk]
    expect(prioritizePeople(hits)).toBe(hits)
    const person = { userData: {} as Record<string, unknown>, parent: null }
    markPerson(person)
    const people = [{ object: { userData: {}, parent: person }, distance: 1 }]
    expect(prioritizePeople(people)).toBe(people)
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
    expect(prioritizePeople([ground, tree, walker])).toEqual([walker, ground, tree])
  })

  it("clears the effect when a selected identity is gone", () => {
    expect(selectionObjectId(null, objects)).toBe(0)
    expect(selectionObjectId({ kind: "building", id: "gone" }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "traveler", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "monk", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "pile", id: "gone" }, objects)).toBe(0)
  })
})
