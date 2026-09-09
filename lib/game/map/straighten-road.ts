import { elevationStep } from "./elevation"
import type { GameMap } from "./types"

/** A four-connected raster of a straight line. The shared road renderer turns
 * its evenly spaced staircase into the same diagonal followed by travelers. */
function straightTiles(from: number, to: number, width: number): number[] {
  let x = from % width, z = Math.floor(from / width)
  const dx = to % width - x, dz = Math.floor(to / width) - z
  const nx = Math.abs(dx), nz = Math.abs(dz), sx = Math.sign(dx), sz = Math.sign(dz)
  const result = [from]
  let ix = 0, iz = 0
  while (ix < nx || iz < nz) {
    if (iz === nz || (ix < nx && (ix + .5) * nz <= (iz + .5) * nx)) { x += sx; ix++ }
    else { z += sz; iz++ }
    result.push(z * width + x)
  }
  return result
}

/** Remove unexplained bends through open land before stamping the initial road.
 * Woods, water, bridges, buildings and cliff edges retain their original route.
 * Called separately between fixed waypoints so gameplay junctions stay anchored. */
export function straightenRoad(map: GameMap, original: readonly number[], allowed: (x: number, z: number) => boolean = () => true): number[] {
  let route = [...original]
  if (route.length < 3) return [...route]
  const occupied = new Set<number>()
  for (const b of map.buildings) for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) occupied.add(z * map.width + x)
  const open = (i: number) => allowed(i % map.width, Math.floor(i / map.width)) && !occupied.has(i) && ["grass", "clearing", "dirt", "sand", "path", "track"].includes(map.tiles[i])
  const climb = (line: readonly number[]) => line.slice(1).reduce((sum, p, i) => sum + elevationStep(map.elevation, line[i], p), 0)
  // A ramp must leave the river along its axis, with one level tile after
  // it. Otherwise a diagonal staircase promotes every bend into more deck.
  const pinned = new Set<number>()
  const wet = (i: number) => map.tiles[i] === "water" || map.tiles[i] === "bridge"
  // Road generation already carves ordinary forest. Reserve the same small
  // clearance at a bank before trees are placed, without crossing old growth.
  const approachOpen = (i: number) => open(i) || (!occupied.has(i) && allowed(i % map.width, Math.floor(i / map.width)) && map.tiles[i] === "forest")
  const alignExits = () => {
    for (let bank = 1; bank < route.length; bank++) {
      if (!wet(route[bank - 1]) || !approachOpen(route[bank])) continue
      const i = route[bank], water = route[bank - 1]
      const dx = i % map.width - water % map.width, dz = Math.floor(i / map.width) - Math.floor(water / map.width)
      const x = i % map.width + dx, z = Math.floor(i / map.width) + dz, landing = z * map.width + x
      if (x < 0 || x >= map.width || z < 0 || z >= map.depth || !approachOpen(landing) || !Number.isFinite(elevationStep(map.elevation, i, landing))) continue
      for (let join = bank + 1; join < Math.min(route.length, bank + 13); join++) {
        if (!approachOpen(route[join])) break
        const line = straightTiles(landing, route[join], map.width)
        if (line.includes(i) || !line.every(approachOpen) || !Number.isFinite(climb([i, ...line]))) continue
        // Closely spaced crossings can align toward the same landing. Do not
        // splice through retained road: that creates a loop and a U-turn on
        // the deck, which has no continuous walking lane.
        const retained = new Set([...route.slice(0, bank + 1), ...route.slice(join + 1)])
        if (line.some((tile) => retained.has(tile))) continue
        // Keep the crossing and its ramp while reconnecting to the dry road.
        route.splice(bank + 1, join - bank, ...line)
        pinned.add(i); pinned.add(landing)
        break
      }
    }
  }
  alignExits()
  route.reverse(); alignExits(); route.reverse()
  const result = [route[0]]
  for (let from = 0; from < route.length - 1;) {
    let best = from + 1, replacement = [route[from], route[best]]
    if (open(route[from])) for (let to = from + 1; to < Math.min(route.length, from + 33); to++) {
      if (!open(route[to]) || (to > from + 1 && pinned.has(route[to - 1]))) break
      const line = straightTiles(route[from], route[to], map.width)
      if (!line.every(open)) continue
      // Do not replace a contour-following route with a steeper climb.
      const old = route.slice(from, to + 1)
      if (climb(line) > climb(old) + (map.elevation?.settings.slopeCost ?? 1) * .1) continue
      // Also regularize equal-length Manhattan paths: otherwise reducing random
      // routing costs still leaves arbitrary side-to-side steps in an empty glade.
      if (line.length > old.length || line.every((p, i) => p === old[i])) continue
      // A shortcut must not double back through an already emitted tile or a
      // later pinned approach, even when the straight line itself is clear.
      const retained = new Set([...result.slice(0, -1), ...route.slice(to + 1)])
      if (line.some((tile) => retained.has(tile))) continue
      best = to; replacement = line
    }
    result.push(...replacement.slice(1)); from = best
  }
  return result
}
