import { afterEach, describe, expect, it, vi } from "vitest"
import { useBuildStore } from "./build-store"
import { useCameraStore, type Selection } from "./camera-store"
import { selectElement, selectionObjectId } from "./selection"
import { buildingObjectId, pileObjectId, RELIC_OBJECT_ID, residentObjectId, travelerObjectId, treeObjectId } from "./render/outline"

const objects = {
  buildings: [{ id: "hovel" }, { id: "lumberCamp-1" }],
  travelers: [{ id: 41 }, { id: 9 }],
  monks: [{ id: 72 }, { id: 18 }],
  piles: [{ id: "pile-a" }, { id: "pile-b" }],
}
const selections: Selection[] = [
  { kind: "tree", id: 6 }, { kind: "building", id: "lumberCamp-1" },
  { kind: "traveler", id: 9 }, { kind: "monk", id: 18 },
  { kind: "pile", id: "pile-b" }, { kind: "relic" },
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
    useBuildStore.getState().setTool("lumberCamp")
    selectElement(candidate, { ...event, delta: 0 })
    expect(useCameraStore.getState().selection).toEqual(previous)
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })

  it("maps stable game identities to distinct rendered IDs", () => {
    const ids = selections.map((selection) => selectionObjectId(selection, objects))
    expect(ids).toEqual([
      treeObjectId(2, 6), buildingObjectId(1), travelerObjectId(1),
      residentObjectId(1), pileObjectId(1), RELIC_OBJECT_ID,
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(selectionObjectId({ kind: "pile", id: "pile-b" }, { ...objects, piles: [objects.piles[1]] })).toBe(pileObjectId(0))
  })

  it("clears the effect when a selected identity is gone", () => {
    expect(selectionObjectId(null, objects)).toBe(0)
    expect(selectionObjectId({ kind: "building", id: "gone" }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "traveler", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "monk", id: -1 }, objects)).toBe(0)
    expect(selectionObjectId({ kind: "pile", id: "gone" }, objects)).toBe(0)
  })
})
