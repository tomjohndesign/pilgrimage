import { isObjectVisible } from "./scene-visibility"
import { useBuildStore } from "./build-store"
import { isSelected, useCameraStore, type Selection } from "./camera-store"
import {
  buildingObjectId, pileObjectId, RELIC_OBJECT_ID, residentObjectId,
  travelerObjectId, treeObjectId, wildlifeObjectId,
} from "./render/outline"

export const SELECTION_COLOR = "#e4bb58"
export const SELECTION_OUTLINE_COLOR = "#ffffff"
export const SELECTION_OUTLINE_OPACITY = 0.65
export const SELECTION_FILL = "#fff2ba"
export const SELECTION_FILL_OPACITY = 0.06

/** All world selections share drag rejection, build-tool priority, and toggle behavior. */
export function selectElement(candidate: Selection, event: { delta: number; stopPropagation: () => void }) {
  if (event.delta > 6 || useBuildStore.getState().tool) return false
  event.stopPropagation()
  const camera = useCameraStore.getState()
  camera.select(isSelected(camera.selection, candidate) ? null : candidate)
  return true
}

/** Resolve inspector identities to the same IDs used by the visible geometry. */
export function selectionObjectId(selection: Selection | null, objects: {
  buildings: readonly { id: string }[]
  travelers: readonly { id: number }[]
  monks: readonly { id: number }[]
  piles: readonly { id: string }[]
}): number {
  if (!selection) return 0
  if (selection.kind === "animal") return wildlifeObjectId(selection.id)
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

/** Marks a rendered subtree as a person, for `prioritizePeople`. */
const PERSON_PICK = "person"

interface PickObject {
  visible?: boolean
  userData?: Record<string, unknown>
  parent?: PickObject | null
}

/** Tag a character's root group so every hit inside it counts as that person. */
export function markPerson(object: { userData: Record<string, unknown> } | null | undefined) {
  if (object) object.userData[PERSON_PICK] = true
}

/** True when the object, or anything it hangs from, stands for a person. */
function isPersonPick(object: PickObject | null | undefined): boolean {
  for (let node = object ?? null; node; node = node.parent ?? null) {
    if (node.userData?.[PERSON_PICK] === true) return true
  }
  return false
}

/**
 * Re-order raycast hits so people come first. A walker is small next to the
 * trees and buildings around them, so the nearest hit under the pointer is
 * usually the scenery standing in front — clicking a pilgrim on a forest path
 * would pick the crown that hides them. Distance order is kept within each
 * group, so the nearest person still wins, and scenery is only demoted, never
 * dropped: with no tool active the person's handler stops the event, and in
 * build mode nothing stops it and the ground still takes the click.
 */
export function prioritizePeople<T extends { object: PickObject }>(hits: readonly T[]): T[] {
  // Batched buildings keep their original surface as the exact picking mesh.
  // Its own render visibility is off; user-hidden ancestors still reject hits.
  const visibleHits = hits.filter(hit => hit.object.userData?.batchedPickTarget === true
    ? isObjectVisible(hit.object.parent ?? {}) : isObjectVisible(hit.object))
  if (visibleHits.length !== hits.length) hits = visibleHits
  const people = hits.filter((hit) => isPersonPick(hit.object))
  if (people.length === 0 || people.length === hits.length) return hits as T[]
  return [...people, ...hits.filter((hit) => !isPersonPick(hit.object))]
}
