import type { Selection } from "./camera-store"
import { monkPositionRegistry } from "./monks"
import { simRegistry } from "./sim"
import { wildlifeRegistry } from "./wildlife/registry"

export interface FollowPoint {
  x: number
  z: number
}

/** Companions farther than this from the selected traveler are elsewhere on the map, not in the company being watched. */
export const FOLLOW_COMPANY_RADIUS = 12

/**
 * Where the camera should look to keep the selection in view. A traveler in a
 * party yields the centre of the company around them, so the group stays on
 * screen without a straggler, or a member re-entering at the far road end,
 * dragging the view away. A lone traveler, a monk, or an animal yields their
 * own spot. Null once the selected character has left the world, which ends
 * the follow.
 */
export function followPoint(selection: Selection | null): FollowPoint | null {
  if (!selection) return null
  if (selection.kind === "traveler") {
    const sim = simRegistry.current
    const selected = sim?.travelers.get(selection.id)
    if (!sim || !selected) return null
    const party = selected.partyId === undefined ? undefined : sim.parties.get(selected.partyId)
    let minX = selected.x, maxX = selected.x, minZ = selected.z, maxZ = selected.z
    for (const id of party?.members ?? []) {
      const member = sim.travelers.get(id)
      if (!member || Math.hypot(member.x - selected.x, member.z - selected.z) > FOLLOW_COMPANY_RADIUS) continue
      minX = Math.min(minX, member.x); maxX = Math.max(maxX, member.x)
      minZ = Math.min(minZ, member.z); maxZ = Math.max(maxZ, member.z)
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
  }
  if (selection.kind === "monk") {
    const monk = monkPositionRegistry.current?.get(selection.id)
    return monk ? { x: monk.x, z: monk.z } : null
  }
  if (selection.kind === "animal") {
    const animal = wildlifeRegistry.current?.animals[selection.id]
    return animal && !animal.reserve ? { x: animal.x, z: animal.z } : null
  }
  return null
}
