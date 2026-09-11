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
/** Companions retain a faint edge; only the inspected person gets a fill. */
export const COMPANION_OUTLINE_OPACITY = 0.22

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

/** The invisible click volume every walking figure shares. */
export const CHARACTER_HIT_TARGET = "character-hit-target"

/** Marks a rendered subtree as a person, for `prioritizePeople`. */
const PERSON_PICK = "person"
const SCENERY_PICK = "selectionScenery"

interface PickObject {
  name?: string
  visible?: boolean
  userData?: Record<string, unknown>
  parent?: PickObject | null
}

/** Tag a character's root group so every hit inside it counts as that person. */
export function markPerson(object: { userData: Record<string, unknown> } | null | undefined) {
  if (object) object.userData[PERSON_PICK] = true
}

/** Only trees and environment scenery yield their clicks to people behind them. */
export function markSelectionScenery(object: { userData: Record<string, unknown> } | null | undefined) {
  if (object) object.userData[SCENERY_PICK] = true
}

function hasPickTag(object: PickObject | null | undefined, tag: string): boolean {
  for (let node = object ?? null; node; node = node.parent ?? null) {
    if (node.userData?.[tag] === true) return true
  }
  return false
}

/**
 * Let people be picked through trees and environment scenery. Other surfaces
 * keep their distance order with people, so roofs and walls block occupants
 * while an exposed person in front of a building remains selectable. Scenery
 * is demoted only when a person is hit, and retained for build-tool events.
 */
export function prioritizePeople<T extends { object: PickObject }>(hits: readonly T[]): T[] {
  // Batched buildings and transport keep their original surfaces for picking.
  // Its own render visibility is off; user-hidden ancestors still reject hits.
  const visibleHits = hits.filter(hit => hit.object.userData?.batchedPickTarget === true
    ? isObjectVisible(hit.object.parent ?? {}) : isObjectVisible(hit.object))
  if (visibleHits.length !== hits.length) hits = visibleHits
  if (!hits.some(hit => hasPickTag(hit.object, PERSON_PICK))) return hits as T[]
  const solid: T[] = [], scenery: T[] = []
  for (const hit of hits) {
    const passThrough = hasPickTag(hit.object, SCENERY_PICK) && !hasPickTag(hit.object, PERSON_PICK)
    ;(passThrough ? scenery : solid).push(hit)
  }
  return preferDrawnFigures(scenery.length ? [...solid, ...scenery] : hits as T[])
}

/**
 * Figure sprites only report their drawn texels, so one figure's opaque pixel
 * beats another figure's invisible click volume in front of it: a crowd's
 * boxes never swallow the cart, animal or walker seen behind them. Only
 * neighbouring person hits reorder; any surface between them keeps its place.
 */
function preferDrawnFigures<T extends { object: PickObject }>(hits: T[]): T[] {
  let result: T[] | null = null
  for (let start = 0; start < hits.length;) {
    if (!hasPickTag(hits[start].object, PERSON_PICK)) { start++; continue }
    let end = start + 1
    while (end < hits.length && hasPickTag(hits[end].object, PERSON_PICK)) end++
    const run = hits.slice(start, end)
    const volumes = run.filter(hit => hit.object.name === CHARACTER_HIT_TARGET)
    if (volumes.length && volumes.length < run.length) {
      result ??= [...hits]
      result.splice(start, run.length, ...run.filter(hit => hit.object.name !== CHARACTER_HIT_TARGET), ...volumes)
    }
    start = end
  }
  return result ?? hits
}
