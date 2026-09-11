import type { BuildingDef, TilePos } from "./map/types"

/** Rear altar position in the building’s canonical local coordinates. */
export const shrineAltarZ = (depth: number) => -Math.max(0, (depth - 3) / 2) - (depth > 3 ? .4 : 0)

/** Canonical entrance is +Z; older east/west-facing sites swap their local axes. */
export function shrineLayout(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  const rotation = door && door.x < building.x ? -Math.PI/2
    : door && door.x >= building.x+building.w ? Math.PI/2
    : door && door.z < building.z ? Math.PI : 0
  const sideways=Math.abs(rotation)===Math.PI/2
  const width=sideways?building.d:building.w, depth=sideways?building.w:building.d
  // On the second tile from the rear wall, leaving room to approach the altar.
  const altarZ=shrineAltarZ(depth)
  const offset={x:Math.sin(rotation)*altarZ,z:Math.cos(rotation)*altarZ}
  const altar={x:building.x+Math.floor(building.w/2)+offset.x,z:building.z+Math.floor(building.d/2)+offset.z}
  const altarTile={x:Math.round(altar.x),z:Math.round(altar.z)}
  return {rotation,width,depth,altarZ,offset,altar,altarTile}
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
  const layout = shrineLayout(building, door)
  return [-1, 1].flatMap(side => Array.from({ length: Math.max(1, layout.depth - 3) }, (_, row) => ({
    id: `prayer-${side}-${row}`,
    tile: shrinePoint(building, door, side, Math.floor(layout.depth / 2) - 1 - row),
    heading: layout.rotation + Math.PI,
  })))
}

export function shrineStations(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  const layout = shrineLayout(building, door)
  return {
    viewing: shrinePoint(building, door, 0, Math.round(layout.altarZ) + 1),
    keeper: shrinePoint(building, door, 0, Math.round(layout.altarZ) - 1),
    offering: shrinePoint(building, door, 1, Math.floor(layout.depth / 2)),
    queueCapacity: Math.max(1, layout.depth - 2),
  }
}

/** A place in the line asks the keeper to uncover the relic; private prayer does not. */
export function isRelicViewingSeat(seat?: string): boolean {
  return !!seat && seat.startsWith("queue-")
}
