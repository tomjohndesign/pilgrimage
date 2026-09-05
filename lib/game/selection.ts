import { useBuildStore } from "./build-store"
import { isSelected, useCameraStore, type Selection } from "./camera-store"
import {
  buildingObjectId, pileObjectId, RELIC_OBJECT_ID, residentObjectId,
  travelerObjectId, treeObjectId,
} from "./render/outline"

export const SELECTION_COLOR = "#e4bb58"
export const SELECTION_OUTLINE_COLOR = "#ffffff"
export const SELECTION_OUTLINE_OPACITY = 0.65
export const SELECTION_FILL = "#fff2ba"
export const SELECTION_FILL_OPACITY = 0.06

/** All world selections share drag rejection, build-tool priority, and toggle behavior. */
export function selectElement(candidate: Selection, event: { delta: number; stopPropagation: () => void }) {
  if (event.delta > 6 || useBuildStore.getState().tool) return
  event.stopPropagation()
  const camera = useCameraStore.getState()
  camera.select(isSelected(camera.selection, candidate) ? null : candidate)
}

/** Resolve inspector identities to the same IDs used by the visible geometry. */
export function selectionObjectId(selection: Selection | null, objects: {
  buildings: readonly { id: string }[]
  travelers: readonly { id: number }[]
  monks: readonly { id: number }[]
  piles: readonly { id: string }[]
}): number {
  if (!selection) return 0
  if (selection.kind === "relic") return RELIC_OBJECT_ID
  if (selection.kind === "tree") return treeObjectId(objects.buildings.length, selection.id)
  const list = selection.kind === "building" ? objects.buildings
    : selection.kind === "traveler" ? objects.travelers
      : selection.kind === "monk" ? objects.monks : objects.piles
  const index = list.findIndex((object) => object.id === selection.id)
  if (index < 0) return 0
  return selection.kind === "building" ? buildingObjectId(index)
    : selection.kind === "traveler" ? travelerObjectId(index)
      : selection.kind === "monk" ? residentObjectId(index) : pileObjectId(index)
}
