import type { CartPose } from "./follow"

/** Choose forward or backward steps without rotating an animal to face its
 * tail. Ordinary turns still follow the direction of travel. */
export function animalTravel(facing: number, dx: number, dz: number) {
  if (Math.hypot(dx, dz) < 1e-8) return { heading: facing, reversing: false }
  const travel = Math.atan2(dx, dz), reversing = Math.cos(travel - facing) < -0.01
  const heading = travel + (reversing ? Math.PI : 0)
  return { heading: Math.atan2(Math.sin(heading), Math.cos(heading)), reversing }
}

/** A hitched animal must face away from the axle, even when its previous
 * facing came from grazing or a route reset. Flip the gait with the heading
 * so correcting an invalid facing preserves the direction of its steps.
 * Use the actual drawbar: bridge guidance can rotate the cart independently. */
export function hitchedAnimalTravel(cart: CartPose, travel: { heading: number; reversing: boolean }) {
  const outward = Math.atan2(cart.hitch.x - cart.x, cart.hitch.z - cart.z)
  if (Math.cos(travel.heading - outward) >= 0) return travel
  const heading = travel.heading + Math.PI
  return { heading: Math.atan2(Math.sin(heading), Math.cos(heading)), reversing: !travel.reversing }
}

export function transportPhase(phase: number, distance: number, stride: number, reversing: boolean) {
  return ((phase + distance / stride * (reversing ? -1 : 1)) % 1 + 1) % 1
}
