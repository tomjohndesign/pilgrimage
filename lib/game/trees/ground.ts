import { forestTrackTiles } from "../map/forest-entrances"
import type { GameMap } from "../map/types"
import { worldToTileX, worldToTileZ } from "../map/types"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { inwardTileDepth, depthBandCorners } from "../map/depth-field"
import { SHORE_CORNERS } from "../map/shoreline"
import { isWaterTerrain, isWoods } from "../map/terrain"
import type { TreePlacement } from "./placement"

/** Prebuilt, palette-limited masks; shared by every forest tile without extra draw calls. */
export const TREE_GROUND_ATLAS = "/textures/forest-shadows-v4.png"
export const TREE_GROUND_FRAME = { pixels: 44, columns: 5, rows: 16 } as const

/** Nearby crowns overlap above trunk gaps. Rebuild from standing trees after felling. */
export function treeCanopyDepth(map: GameMap, trees: readonly TreePlacement[], felled?: ReadonlySet<number>) {
  const occupied = new Uint8Array(map.tiles.length)
  trees.forEach((tree, index) => {
    if (felled?.has(index) || tree.dead) return
    const x = worldToTileX(map, tree.x), z = worldToTileZ(map, tree.z)
    if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return
    occupied[z * map.width + x] = 1
  })
  const covered = occupied.slice(), crowns = new Uint8Array(occupied.length)
  // Overlapping crowns also close the small gaps inside a stand. Paths,
  // glades and water stay open; distant trunks cannot close a felled clearing.
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    const i = z * map.width + x
    let nearby = 0
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nz >= 0 && nx < map.width && nz < map.depth) {
        const trunk = occupied[nz * map.width + nx]
        // A path, water strip or real glade interrupts the overlapping stand.
        if (Math.max(Math.abs(dx), Math.abs(dz)) === 2
          && !isWoods(map.tiles[(z + Math.trunc(dz / 2)) * map.width + x + Math.trunc(dx / 2)])) continue
        crowns[i] += trunk
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) nearby += trunk
      }
    }
    if ((nearby > 0 || crowns[i] >= 3) && isWoods(map.tiles[i])) covered[i] = 1
  }
  const depths = inwardTileDepth(covered, map.width, map.depth)
  // Classify the connected stand, not each tile's trunk count: local gaps in
  // a dense forest must not punch lighter patches through its interior.
  const visited = new Uint8Array(covered.length)
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i] || visited[i]) continue
    const region = [i]; visited[i] = 1
    let trunks = 0
    for (let q = 0; q < region.length; q++) {
      const cell = region[q], x = cell % map.width, z = Math.floor(cell / map.width)
      trunks += occupied[cell]
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, n = nz * map.width + nx
        if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth || !covered[n] || visited[n]) continue
        visited[n] = 1; region.push(n)
      }
    }
    if (trunks < 3) for (const cell of region) depths[cell] = Math.min(depths[cell], 1)
  }
  return depths
}

/** A one-tile dim fringe reaches trails and verges, without deepening the forest itself. */
export function treeShadowDepth(map: GameMap, trees: readonly TreePlacement[], felled?: ReadonlySet<number>) {
  const canopy = treeCanopyDepth(map, trees, felled)
  const depths = canopy.slice()
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    const i = z * map.width + x
    if (canopy[i] || isWaterTerrain(map.tiles[i])) continue
    if ((x > 0 && canopy[i - 1]) || (x + 1 < map.width && canopy[i + 1]) ||
      (z > 0 && canopy[i - map.width]) || (z + 1 < map.depth && canopy[i + map.width])) depths[i] = 1
  }
  return depths
}

/** R selects a solid depth/diagonal sprite. Grain never lives on internal tile edges. */
export function treeGroundField(map: GameMap, trees: readonly TreePlacement[], felled?: ReadonlySet<number>) {
  const depths = treeShadowDepth(map, trees, felled)
  // Binary sprite selection, never a brightness gradient. Authored clearings
  // and the shoulders of forest tracks retain the same dark litter artwork.
  const dark = new Set(map.tiles.flatMap((t, i) => t === "darkwood" ? [i] : []))
  for (const forest of map.darkForests ?? []) for (const p of forest.clearing) dark.add(p.z * map.width + p.x)
  // Preserve the forest edge even where cutting a track removed its trees.
  // An authored route may cross open meadow long before reaching old growth.
  const forestFloor = new Set(map.darkForestFloor ?? dark)
  for (const i of forestTrackTiles(map)) {
    if (forestFloor.has(i)) dark.add(i)
    const x = i % map.width, z = Math.floor(i / map.width)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, n = nz * map.width + nx
      if (nx >= 0 && nz >= 0 && nx < map.width && nz < map.depth && map.tiles[n] === "clearing" && forestFloor.has(n)) dark.add(n)
    }
  }
  const corners = depthBandCorners(map, Array.from(depths), true)
  const data = new Uint8Array(map.width * map.depth * 4)
  for (let i = 0; i < depths.length; i++) {
    if (isWaterTerrain(map.tiles[i])) continue
    if (!depths[i]) {
      if (dark.has(i)) data.set([0, 255, 0, 255], i * 4)
      continue
    }
    const corner = corners[i]
    const donor = corner >= 0 ? depths[i + SHORE_CORNERS[corner][0]] : depths[i]
    const frame = (depths[i] * 4 + donor) * 5 + corner + 1
    data.set([frame + 1, dark.has(i) ? 255 : 0, 0, 255], i * 4)
  }
  return { data, width: map.width, height: map.depth }
}

/** Two point samples: tile record then prebuilt sprite. No blending, shadow pass or loops. */
export const TREE_GROUND_GLSL = /* glsl */ `
  uniform sampler2D treeGroundMap;
  uniform sampler2D treeGroundAtlas;
  uniform vec2 treeGroundMapSize;
  vec3 treeGroundCover(vec2 world) {
    vec2 grid = terrainPaintWorld(world) + treeGroundMapSize * 0.5;
    vec4 record = texture2D(treeGroundMap, (floor(grid) + 0.5) / treeGroundMapSize);
    float frame = floor(record.r * 255.0 + 0.5) - 1.0;
    if (frame < 0.0) return vec3(0.0, record.g, record.g);
    vec2 cell = vec2(mod(frame, ${TREE_GROUND_FRAME.columns}.0), floor(frame / ${TREE_GROUND_FRAME.columns}.0));
    // Crop the last native pixel at tile boundaries rather than stretching the artwork.
    vec2 pixel = floor(fract(grid) / ${CHARACTER_PIXEL_SIZE});
    vec2 uv = (cell * ${TREE_GROUND_FRAME.pixels}.0 + pixel + 0.5) / vec2(${TREE_GROUND_FRAME.columns * TREE_GROUND_FRAME.pixels}.0, ${TREE_GROUND_FRAME.rows * TREE_GROUND_FRAME.pixels}.0);
    return vec3(texture2D(treeGroundAtlas, vec2(uv.x, 1.0 - uv.y)).rg, record.g);
  }
`
