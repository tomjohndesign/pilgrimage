import type { GameMap } from "../map/types"
import { TILE_HEIGHT } from "../map/terrain"

/** Raised platforms, paving and water sources keep their authored ground. */
export function hasDirtFloor(variant: string | undefined): boolean {
  return variant !== "storehouse" && variant !== "enclosure" && variant !== "well" && variant !== "watering-hole"
}

/** A small worn apron outside the occupied tiles; never changes placement or routes. */
export const DIRT_FLOOR_OVERLAP = .18
export const FLOOR_NEIGHBOURS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const

/** One texture lookup identifies the union of adjacent dirt plots, without internal seams. */
export function dirtFloorMask(map: GameMap) {
  const occupied = new Uint8Array(map.width * map.depth)
  for (const building of map.buildings) {
    // The floor stops at the walls: no worn approach in front of the door.
    if (building.id === map.site?.hovelId || !hasDirtFloor(building.buildType)) continue
    for (let z=building.z;z<building.z+building.d;z++) for (let x=building.x;x<building.x+building.w;x++) {
      if (x>=0 && z>=0 && x<map.width && z<map.depth) occupied[z*map.width+x]=1
    }
  }
  const data = new Uint8Array(occupied.length * 4), tiles = new Set<number>()
  const height = map.elevation?.height ?? []
  for (let z=0;z<map.depth;z++) for (let x=0;x<map.width;x++) {
    const index=z*map.width+x
    if (map.tiles[index] === "water" || map.tiles[index] === "bridge" || (map.water?.depth[index] ?? 0)>0) continue
    let neighbours=0
    FLOOR_NEIGHBOURS.forEach(([dx,dz],bit)=>{
      const nx=x+dx,nz=z+dz,other=nz*map.width+nx
      // Dirt follows gentle ground at the apron, but does not spill over a cliff.
      if (nx>=0 && nz>=0 && nx<map.width && nz<map.depth && occupied[other]
        && Math.abs((height[index] ?? TILE_HEIGHT)-(height[other] ?? TILE_HEIGHT))< (map.elevation?.settings.cliffThreshold ?? 1)) neighbours |= 1<<bit
    })
    data[index*4]=neighbours
    data[index*4+1]=occupied[index] ? 255 : 0
    if (occupied[index] || neighbours) tiles.add(index)
  }
  return { data, tiles }
}

/** Noise and anti-aliasing use the paths' world-space sampling and rendered pixel size. */
export const DIRT_FLOOR_GLSL = `
float dirtFloorCover(vec2 world, vec2 tileLocal) {
  vec2 cell = floor(world + dirtFloorMapSize * .5);
  vec2 mask = texture2D(dirtFloorMap, (cell + .5) / dirtFloorMapSize).rg;
  if (mask.g > .5) return 1.0;
  float bits = floor(mask.r * 255.0 + .5);
  if (bits < .5) return 0.0;
  float distanceToFloor = 2.0;
  ${FLOOR_NEIGHBOURS.map(([x,z],i)=>`if (mod(floor(bits / ${2**i}.0), 2.0) > .5) {
    vec2 q = abs(tileLocal - .5 - vec2(${x}.0,${z}.0)) - .5;
    distanceToFloor = min(distanceToFloor, length(max(q, 0.0)) + min(max(q.x,q.y),0.0));
  }`).join("\n")}
  float rough = tileNoise(world * 3.7) * .65 + tileNoise(world * 8.3) * .35;
  float edge = .025 + ${DIRT_FLOOR_OVERLAP-.025} * rough;
  float aa = max(fwidth(distanceToFloor), .001);
  return 1.0 - smoothstep(edge-aa*.5, edge+aa*.5, distanceToFloor);
}`
