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


/** A thin board on the paving, beneath the ground-kneeling sprite. */
export const KNEELER_PAD_TOP = .009
/** One prayer place per kneeler, with a clear centre aisle. Shared by art and navigation. */
export function shrineKneelers(width: number, depth: number) {
  return [-1,1].flatMap(side => Array.from({length:Math.max(1,depth-3)},(_,row)=>({
    id:`kneeler-${side}-${row}`, x:side*Math.min(Math.round(width*.33),width/2-.48),
    z:Math.floor(depth/2)-1-row, length:Math.min(.6,width*.25),
  })))
}
export function shrineSeats(building: Pick<BuildingDef,"x"|"z"|"w"|"d">, door?: TilePos) {
  const layout=shrineLayout(building,door), sin=Math.round(Math.sin(layout.rotation)),cos=Math.round(Math.cos(layout.rotation))
  return shrineKneelers(layout.width,layout.depth).map(kneeler=>({...kneeler,
    tile:{x:building.x+Math.floor(building.w/2)+Math.round(kneeler.x*cos+kneeler.z*sin),
      z:building.z+Math.floor(building.d/2)+Math.round(kneeler.z*cos-kneeler.x*sin)},
    heading:layout.rotation+Math.PI,
  }))
}
