import { type TerrainId } from "./terrain"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./types"

/**
 * The wayside marker at the fork for the shrine. Pure geometry — no three.js,
 * no React — so where the post lands can be checked headlessly.
 *
 * A traveller on the road has no reason to guess which way the relic lies, so
 * the way to it is marked where it leaves the road: a post at a corner of the
 * junction, a board pointing along the branch, and a cross to say what stands
 * at the end of it. The post never stands on the track itself — it takes the
 * open ground in the crook of the fork, set in toward the corner so it reads
 * as part of the junction rather than something dropped in the field.
 */

/** Ground a post can be driven into: open, dry and clear of the tree line. */
const OPEN_GROUND: readonly TerrainId[] = ["grass", "dirt", "clearing", "sand"]

/** Woods take the post too, rather than lose the marker: the trees stand off it. */
const WOODED_GROUND: readonly TerrainId[] = [...OPEN_GROUND, "forest", "darkwood"]

/** How far in from the corner tile's centre the post stands, in tiles. */
export const SIGNPOST_INSET = 0.32

/** No trunk stands inside this radius of the post, so nothing grows through the board. */
export const SIGNPOST_CLEARANCE = 0.7

/** Corners further along the branch than this are no longer part of the fork. */
const MAX_BEND_SEARCH = 6

/** A cliff between the post and the way it marks reads as two separate places. */
const MAX_CORNER_RISE = 0.25

export interface SignpostPlacement {
  /** The corner tile the post stands on; never a road or track tile. */
  tile: TilePos
  /** World position of the post's foot. */
  x: number
  z: number
  /** Y rotation that swings the pointing board onto the shrine's bearing. */
  yaw: number
}

function usableCorner(map: GameMap, tile: TilePos, beside: TilePos, wooded: boolean): boolean {
  if (tile.x < 0 || tile.z < 0 || tile.x >= map.width || tile.z >= map.depth) return false
  const index = tile.z * map.width + tile.x
  if (!(wooded ? WOODED_GROUND : OPEN_GROUND).includes(map.tiles[index])) return false
  if (map.buildings.some(b => tile.x >= b.x && tile.x < b.x + b.w && tile.z >= b.z && tile.z < b.z + b.d)) return false
  if (map.site && map.site.door.x === tile.x && map.site.door.z === tile.z) return false
  const height = map.elevation?.height
  return !height || Math.abs(height[index] - height[beside.z * map.width + beside.x]) <= MAX_CORNER_RISE
}

/**
 * Where the signpost stands, or null on a map with no shrine branch to mark.
 *
 * The fork's own two corners come first — the tiles diagonally out from the
 * junction, one either side of the road. Failing those, the search steps along
 * to the outer corners of the branch's next few bends. Open ground wins at
 * each corner in turn, but a corner in the trees is taken before the search
 * moves further from the road: a marker at the mouth of a forest track is the
 * point of the thing, and the stand grows around it (see SIGNPOST_CLEARANCE).
 */
export function signpostPlacement(map: GameMap): SignpostPlacement | null {
  const site = map.site
  if (!site || site.branch.length < 2) return null
  const hovel = map.buildings.find(b => b.id === site.hovelId)
  if (!hovel) return null

  const corners: { tile: TilePos; beside: TilePos }[][] = []
  const junction = site.branch[0], first = site.branch[1]
  const step = { x: first.x - junction.x, z: first.z - junction.z }
  corners.push([{ x: step.z, z: -step.x }, { x: -step.z, z: step.x }]
    .map(side => ({ tile: { x: first.x + side.x, z: first.z + side.z }, beside: junction })))
  // Both tiles adjacent to a bend but off the branch sit on the outside of it.
  for (let i = 1; i < Math.min(MAX_BEND_SEARCH, site.branch.length - 1); i++) {
    const at = site.branch[i]
    const into = { x: at.x - site.branch[i - 1].x, z: at.z - site.branch[i - 1].z }
    const out = { x: site.branch[i + 1].x - at.x, z: site.branch[i + 1].z - at.z }
    if (into.x === out.x && into.z === out.z) continue
    corners.push([{ x: at.x + into.x, z: at.z + into.z }, { x: at.x - out.x, z: at.z - out.z }]
      .map(tile => ({ tile, beside: at })))
  }

  let corner: { tile: TilePos; beside: TilePos } | undefined
  for (const pair of corners) {
    corner = pair.find(c => usableCorner(map, c.tile, c.beside, false))
      ?? pair.find(c => usableCorner(map, c.tile, c.beside, true))
    if (corner) break
  }
  if (!corner) return null

  // Hug the corner: step in from the tile's centre toward the ground it marks.
  const toward = { x: corner.beside.x - corner.tile.x, z: corner.beside.z - corner.tile.z }
  const span = Math.hypot(toward.x, toward.z) || 1
  const x = tileToWorldX(map, corner.tile.x) + SIGNPOST_INSET * toward.x / span
  const z = tileToWorldZ(map, corner.tile.z) + SIGNPOST_INSET * toward.z / span

  const shrineX = tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2
  const shrineZ = tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2
  return { tile: corner.tile, x, z, yaw: Math.atan2(-(shrineZ - z), shrineX - x) }
}
