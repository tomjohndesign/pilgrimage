import type { BuildingDef, TilePos } from "./map/types"

export const isChapel = (building: Pick<BuildingDef, "w" | "d">) => building.w === 2 && building.d === 2

/** Rear altar position in the building’s canonical local coordinates. */
export const shrineAltarZ = (depth: number) => depth === 2 ? 0 : -depth / 2 + 1.3

/** The sanctuary has a shallow stone step; the 2×2 chapel stays level. */
export const shrineAltarRise = (depth: number) => depth > 2 ? .12 : 0
export const shrineChancelFront = (depth: number) => -depth / 2 + 2.2
export function shrineDivider(width: number, depth: number) {
  if (depth <= 2) return []
  const inner = .55, outer = width / 2 - .13
  return [-1, 1].map(side => ({ x: side * (inner + outer) / 2, z: shrineChancelFront(depth) + .06,
    width: outer - inner, depth: .07 }))
}

/** Canonical entrance is +Z; older east/west-facing sites swap their local axes. */
export function shrineLayout(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  const rotation = door && door.x < building.x ? -Math.PI/2
    : door && door.x >= building.x+building.w ? Math.PI/2
    : door && door.z < building.z ? Math.PI : 0
  const sideways=Math.abs(rotation)===Math.PI/2
  const width=sideways?building.d:building.w, depth=sideways?building.w:building.d
  // Leave a walking lane behind the table for the keeper.
  const altarZ=shrineAltarZ(depth)
  const offset={x:Math.sin(rotation)*altarZ,z:Math.cos(rotation)*altarZ}
  const altar={x:building.x+(building.w-1)/2+offset.x,z:building.z+(building.d-1)/2+offset.z}
  const altarTile={x:Math.round(altar.x),z:Math.round(altar.z)}
  const entranceX = door ? (door.x - building.x - (building.w-1)/2) * Math.round(Math.cos(rotation)) - (door.z - building.z - (building.d-1)/2) * Math.round(Math.sin(rotation)) : .5
  return {rotation,width,depth,altarZ,offset,altar,altarTile,entranceX}
}


/** Convert canonical church coordinates to the placed church's tile frame. */
export function shrinePoint(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door: TilePos | undefined, x: number, z: number): TilePos {
  const { rotation } = shrineLayout(building, door)
  const sin = Math.round(Math.sin(rotation)), cos = Math.round(Math.cos(rotation))
  return { x: building.x + Math.floor(building.w / 2) + x * cos + z * sin,
    z: building.z + Math.floor(building.d / 2) + z * cos - x * sin }
}

/** Unfurnished prayer places beside the central queue. */
export function shrineSeats(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  if (isChapel(building)) return []
  const layout = shrineLayout(building, door)
  return [-1, 1].flatMap(side => Array.from({ length: Math.max(1, layout.depth - 3) }, (_, row) => ({
    id: `prayer-${side}-${row}`,
    tile: shrinePoint(building, door, side, Math.floor(layout.depth / 2) - 1 - row),
    heading: layout.rotation + Math.PI,
  })))
}

/** One centered chapel place, or two places facing the church's communion rails. */
export function shrineViewingPlaces(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos): TilePos[] {
  const layout = shrineLayout(building, door)
  if (isChapel(building)) return [{
    x: layout.altar.x + Math.round(Math.sin(layout.rotation)) * .5,
    z: layout.altar.z + Math.round(Math.cos(layout.rotation)) * .5,
  }]
  return [-1, 1].map(side => shrinePoint(building, door, side * (layout.width / 2 - .55), shrineChancelFront(layout.depth) + .45))
}

export function shrineStations(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  const layout = shrineLayout(building, door)
  if (isChapel(building)) {
    const side = -Math.sign(layout.entranceX || 1)
    const sin = Math.round(Math.sin(layout.rotation)), cos = Math.round(Math.cos(layout.rotation))
    return {
      viewing: { x: layout.altar.x + sin * .5, z: layout.altar.z + cos * .5 },
      keeper: { x: layout.altar.x - sin * .5, z: layout.altar.z - cos * .5 },
      offering: { x: layout.altar.x + side * .5 * cos + sin * .5, z: layout.altar.z - side * .5 * sin + cos * .5 },
      queueCapacity: 1,
    }
  }
  return {
    viewing: shrineViewingPlaces(building, door)[0],
    keeper: shrinePoint(building, door, 0, Math.round(layout.altarZ) - 1),
    offering: shrinePoint(building, door, 1, Math.floor(layout.depth / 2)),
    queueCapacity: 2,
  }
}

/** A place in the line asks the keeper to uncover the relic; private prayer does not. */
export function isRelicViewingSeat(seat?: string): boolean {
  return !!seat && seat.startsWith("queue-")
}
