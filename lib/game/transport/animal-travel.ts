/** Choose forward or backward steps without rotating an animal to face its
 * tail. Ordinary turns still follow the direction of travel. */
export function animalTravel(facing: number, dx: number, dz: number) {
  if (Math.hypot(dx, dz) < 1e-8) return { heading: facing, reversing: false }
  const travel = Math.atan2(dx, dz), reversing = Math.cos(travel - facing) < -0.01
  const heading = travel + (reversing ? Math.PI : 0)
  return { heading: Math.atan2(Math.sin(heading), Math.cos(heading)), reversing }
}

export function transportPhase(phase: number, distance: number, stride: number, reversing: boolean) {
  return ((phase + distance / stride * (reversing ? -1 : 1)) % 1 + 1) % 1
}
