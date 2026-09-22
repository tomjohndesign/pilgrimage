import { BASE_PERSON } from "../base-person/pose"
import { DRIVER_HIP } from "../transport/driver"

/** Human bodies sort by their stable support, independent of animated foot plants.
 * Standing hips locate the body beside long animals; seated torsos locate the
 * visible occupant above a cart. These are rig dimensions, not camera biases. */
export function bodySortAnchor(unit: number, seat?: { x: number; y: number; z: number }) {
  return seat
    ? { x: seat.x * unit, y: (seat.y + DRIVER_HIP + BASE_PERSON.body.torsoCenter - BASE_PERSON.body.hipHeight) * unit, z: seat.z * unit }
    : { x: 0, y: BASE_PERSON.body.hipHeight * unit, z: 0 }
}
