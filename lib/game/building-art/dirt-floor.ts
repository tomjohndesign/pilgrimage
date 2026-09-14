import { layoutHand } from "../building-layout"
import { sheepPenLayout } from "../workshop-layout"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import type { GameMap } from "../map/types"
import { isWaterTerrain, TILE_HEIGHT } from "../map/terrain"
import { buildingApproach, buildingEntry, buildingFoldEntry, rotatedFootprint, rotateBuildingPoint } from "../building-rotation"

/** Raised platforms, paving and water sources keep their authored ground. */
export function hasDirtFloor(variant: string | undefined): boolean {
  return variant !== "inn" && variant !== "storehouse" && variant !== "enclosure" && variant !== "monk-shelter" && variant !== "well" && variant !== "watering-hole"
}

/** Room for a feathered grassy edge; traffic alone wears approaches outside the plot. */
export const DIRT_FLOOR_OVERLAP = .18
export const FLOOR_NEIGHBOURS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const

/** Shared terrain mask: adjacent dirt plots in RG, doorway directions in B, patchy pasture in A. */
export function dirtFloorMask(map: GameMap) {
  const occupied = new Uint8Array(map.width * map.depth), pasture = new Uint8Array(occupied.length)
  for (const building of map.buildings) {
    // Only the occupied plot supplies a floor; existing paths cover approaches.
    if (building.id === map.site?.hovelId || !hasDirtFloor(building.buildType)) continue
    const size = rotatedFootprint(building, building.rotation)
    const hut = building.buildType === "sheep-pen" ? sheepPenLayout(size.w, size.d) : null
    for (let z=building.z;z<building.z+building.d;z++) for (let x=building.x;x<building.x+building.w;x++) {
      if (x<0 || z<0 || x>=map.width || z>=map.depth) continue
      const local = rotateBuildingPoint(x-building.x-(building.w-1)/2,z-building.z-(building.d-1)/2,-(building.rotation ?? 0))
      if (hut && !(Math.abs(local.x*layoutHand(building.buildType,building.layoutSeed)-hut.coreX)<hut.coreWidth/2
        && Math.abs(local.z-hut.coreZ)<hut.coreDepth/2)) pasture[z*map.width+x]=1
      else occupied[z*map.width+x]=1
    }
  }
  const data = new Uint8Array(occupied.length * 4), tiles = new Set<number>()
  // The unused blue channel records which edge leads into a real entrance.
  // Keep benches and doorless plots out: only paths reaching a doorway extend.
  for (const building of map.buildings) {
    const front = buildingApproach(map, building)
    if (!front || ["well", "watering-hole"].includes(building.buildType ?? "")) continue
    const entries = [front]
    if (building.id !== map.site?.hovelId) {
      if (building.buildType === "tavern") entries.push(buildingEntry(building, false, -1))
      if (building.buildType === "sheep-pen") entries.push(buildingFoldEntry(building))
    }
    for (const entry of entries) {
      if (entry.x < 0 || entry.z < 0 || entry.x >= map.width || entry.z >= map.depth) continue
      const side = entry.x === building.x - 1 ? 0 : entry.x === building.x + building.w ? 1
        : entry.z === building.z - 1 ? 2 : entry.z === building.z + building.d ? 3 : -1
      if (side >= 0) data[(entry.z * map.width + entry.x) * 4 + 2] |= 1 << side
    }
  }
  const height = map.elevation?.height ?? []
  for (let z=0;z<map.depth;z++) for (let x=0;x<map.width;x++) {
    const index=z*map.width+x
    if (isWaterTerrain(map.tiles[index]) || (map.water?.depth[index] ?? 0)>0) continue
    let neighbours=0
    FLOOR_NEIGHBOURS.forEach(([dx,dz],bit)=>{
      const nx=x+dx,nz=z+dz,other=nz*map.width+nx
      // Dirt follows gentle ground at the apron, but does not spill over a cliff.
      if (nx>=0 && nz>=0 && nx<map.width && nz<map.depth && occupied[other]
        && Math.abs((height[index] ?? TILE_HEIGHT)-(height[other] ?? TILE_HEIGHT))< (map.elevation?.settings.cliffThreshold ?? 1)) neighbours |= 1<<bit
    })
    data[index*4]=neighbours
    data[index*4+1]=occupied[index] ? 255 : 0
    data[index*4+3]=pasture[index] ? 255 : 0
    if (occupied[index] || neighbours || pasture[index]) tiles.add(index)
  }
  return { data, tiles }
}

/** Broken, hoof-worn earth between broad grass patches, on the character pixel grid. */
export const PASTURE_FLOOR_GLSL = `
float pastureFloorCover(vec2 world) {
  vec2 pixel = floor(world / ${CHARACTER_PIXEL_SIZE}) * ${CHARACTER_PIXEL_SIZE};
  float patches = tileNoise(pixel * 1.8) * .75 + tileNoise(pixel * 6.0) * .25;
  return smoothstep(.53, .66, patches) * .9;
}`

/** Noise and anti-aliasing use the paths' world-space sampling and rendered pixel size. */
export const DIRT_FLOOR_GLSL = `
${PASTURE_FLOOR_GLSL}
// Carry the path's existing cross-section from the arrival point to the wall.
// Sampling the same road/contact shape preserves its wear, lanes and opacity;
// an untouched entrance stays grassy, and ordinary dead ends stay rounded.
vec2 buildingPathPoint(vec2 world, vec2 p) {
  vec2 cell = floor(world + dirtFloorMapSize * .5);
  float bits = floor(texture2D(dirtFloorMap, (cell + .5) / dirtFloorMapSize).b * 255.0 + .5);
  if (mod(bits, 2.0) > .5) p.x = min(p.x, .5);
  if (mod(floor(bits / 2.0), 2.0) > .5) p.x = max(p.x, .5);
  if (mod(floor(bits / 4.0), 2.0) > .5) p.y = min(p.y, .5);
  if (mod(floor(bits / 8.0), 2.0) > .5) p.y = max(p.y, .5);
  return p;
}

float dirtFloorCover(vec2 world, vec2 tileLocal) {
  vec2 cell = floor(world + dirtFloorMapSize * .5);
  vec4 mask = texture2D(dirtFloorMap, (cell + .5) / dirtFloorMapSize);
  float pasture = mask.a > .5 ? pastureFloorCover(world) : 0.0;
  float bits = floor(mask.r * 255.0 + .5);
  if (mask.g > .5) {
    // Only exposed sides regrow. Touching floor tiles remain continuous.
    float insideEdge = 2.0;
    if (mod(bits, 2.0) < .5) insideEdge = min(insideEdge, 1.0 - tileLocal.x);
    if (mod(floor(bits / 2.0), 2.0) < .5) insideEdge = min(insideEdge, tileLocal.x);
    if (mod(floor(bits / 4.0), 2.0) < .5) insideEdge = min(insideEdge, 1.0 - tileLocal.y);
    if (mod(floor(bits / 8.0), 2.0) < .5) insideEdge = min(insideEdge, tileLocal.y);
    float growth = tileNoise(world * 7.3) * .12 + tileNoise(world * 17.0) * .05;
    return smoothstep(.015, .13 + growth, insideEdge);
  }
  if (bits < .5) return pasture;
  float distanceToFloor = 2.0;
  ${FLOOR_NEIGHBOURS.map(([x,z],i)=>`if (mod(floor(bits / ${2**i}.0), 2.0) > .5) {
    vec2 q = abs(tileLocal - .5 - vec2(${x}.0,${z}.0)) - .5;
    distanceToFloor = min(distanceToFloor, length(max(q, 0.0)) + min(max(q.x,q.y),0.0));
  }`).join("\n")}
  float rough = tileNoise(world * 3.7) * .65 + tileNoise(world * 8.3) * .35;
  float edge = .005 + .02 * rough;
  float aa = max(fwidth(distanceToFloor), .001);
  return max(pasture, (1.0 - smoothstep(edge-aa*.5, edge+aa*.5, distanceToFloor)) * .12);
}`
