import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

/** Clear the canopy before leaving the hovel, then cruise over any terrain. */
export const FLIGHT_ALTITUDE = 4.5
export const FLIGHT_SPEED = 5.8
const CLIMB_SPEED = 3

export interface FlightPoint {
  x: number
  y: number
  z: number
}

export interface MonkFlight extends FlightPoint {
  target: FlightPoint
  home: FlightPoint
  phase: "climbing" | "cruising" | "returning" | "landing" | "landed"
  cruiseRemaining: number
}

/** Time spent walking, resting, and keeping vigil between rocket excursions. */
export function monkGroundTime(rng: () => number): number {
  return 45 + rng() * 45
}

export function createMonkFlight(start: FlightPoint, home: FlightPoint, map: GameMap, rng: () => number): MonkFlight {
  return {
    x: start.x,
    y: start.y,
    z: start.z,
    home: { ...home },
    target: pickFlightTarget(map, rng),
    phase: "climbing",
    cruiseRemaining: 20 + rng() * 15,
  }
}

export function pickFlightTarget(map: GameMap, rng: () => number): FlightPoint {
  return {
    x: tileToWorldX(map, rng() * (map.width - 1)),
    y: FLIGHT_ALTITUDE + rng() * 1.2,
    z: tileToWorldZ(map, rng() * (map.depth - 1)),
  }
}

/** A short cruise, a return above the shrine, then a vertical landing on open ground. */
export function stepMonkFlight(flight: MonkFlight, map: GameMap, rng: () => number, delta: number) {
  const dt = Math.max(0, Math.min(delta, 0.1))
  if (flight.phase === "landed") return
  if (flight.phase === "climbing") {
    flight.y = Math.min(FLIGHT_ALTITUDE, flight.y + CLIMB_SPEED * dt)
    if (flight.y >= FLIGHT_ALTITUDE) flight.phase = "cruising"
    return
  }
  if (flight.phase === "landing") {
    flight.y = Math.max(flight.home.y, flight.y - CLIMB_SPEED * dt)
    if (flight.y <= flight.home.y) flight.phase = "landed"
    return
  }
  if (flight.phase === "cruising") {
    flight.cruiseRemaining -= dt
    if (flight.cruiseRemaining <= 0) {
      flight.phase = "returning"
      flight.target = { ...flight.home, y: FLIGHT_ALTITUDE }
    }
  }
  const dx = flight.target.x - flight.x
  const dy = flight.target.y - flight.y
  const dz = flight.target.z - flight.z
  const distance = Math.hypot(dx, dy, dz)
  const step = FLIGHT_SPEED * dt
  if (distance <= step) {
    Object.assign(flight, flight.target)
    if (flight.phase === "returning") flight.phase = "landing"
    else flight.target = pickFlightTarget(map, rng)
  } else {
    flight.x += (dx / distance) * step
    flight.y += (dy / distance) * step
    flight.z += (dz / distance) * step
  }
}
