import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { buildingAt } from "./settlement"
import type { TreePlacement } from "./trees/placement"

/**
 * The horse-standing: where visitors leave their horses, pack animals and
 * wagons while they go in to the relic. Nothing is drawn or laid for it; it is
 * a place the people know, a lane of open ground running out at a right angle
 * from the branch well below the church, with animals left a tile off it on
 * either side. Any path there is worn by the traffic itself, and the lane moves
 * on its own once the settlement builds over it.
 */
export interface HorseStanding {
  /** Index into `site.branch` of the tile the lane leaves from. */
  fork: number
  /** Ordered walk from the fork tile (first entry, on the branch) out along the lane, each step to a 4-neighbour. */
  lane: TilePos[]
}

/** Cached per building layout on the simulation; see {@link currentStanding}. */
export interface StandingCache { buildings: GameMap["buildings"]; standing: HorseStanding | null }

/** Tiles of open ground the lane runs out from the branch. */
export const STANDING_LANE_LENGTH = 6
/** Where along the branch the lane forks, as a share of the walk from the door to the road. */
const STANDING_IDEAL_SHARE = 0.6
/** The lane never forks within this of the door or of the junction. */
const STANDING_DOOR_MARGIN = 2
const STANDING_ROAD_MARGIN = 3

const key = (map: GameMap, p: TilePos) => p.z * map.width + p.x
const openGround = (map: GameMap, p: TilePos) => {
  const terrain = tileAt(map, p.x, p.z)
  return (terrain === "grass" || terrain === "clearing" || terrain === "dirt") && !buildingAt(map, p.x, p.z)
}

/** The lane and the strip of ground a tile either side of it, where the animals stand. */
export function standingGround(standing: HorseStanding): TilePos[] {
  const [fork, first] = standing.lane
  const u = { x: first.x - fork.x, z: first.z - fork.z }, v = { x: u.z, z: -u.x }
  return standing.lane.slice(1).flatMap(p => [p, { x: p.x + v.x, z: p.z + v.z }, { x: p.x - v.x, z: p.z - v.z }])
}

/** Whether the lane and its verges are still open ground: nothing built on them. */
export function standingOpen(map: GameMap, standing: HorseStanding): boolean {
  return standingGround(standing).every(p => openGround(map, p))
}

/**
 * Choose the lane: at every straight tile of the branch outside the margins,
 * on either side, the lane and its verges must be open ground; the candidate
 * nearest the ideal share of the way down the branch with the fewest trunks on
 * it wins. Deterministic for a given map, its buildings and its trees, so a
 * restored world finds the same place.
 */
export function findHorseStanding(map: GameMap, trees: readonly TreePlacement[] = [], felled: ReadonlySet<number> = new Set()): HorseStanding | null {
  const site = map.site
  if (!site || site.branch.length < STANDING_DOOR_MARGIN + STANDING_ROAD_MARGIN + 1) return null
  const branch = site.branch, last = branch.length - 1
  const trunks = new Set<number>()
  trees.forEach((tree, index) => { if (!felled.has(index) && !tree.walking) trunks.add(worldToTileZ(map, tree.z) * map.width + worldToTileX(map, tree.x)) })
  let best: { score: number; standing: HorseStanding } | null = null
  for (let k = STANDING_ROAD_MARGIN; k <= last - STANDING_DOOR_MARGIN; k++) {
    const dx = branch[k + 1].x - branch[k - 1].x, dz = branch[k + 1].z - branch[k - 1].z
    // Only a straight run of track takes a lane at a right angle; skip the elbows.
    if (Math.abs(dx) + Math.abs(dz) !== 2 || (dx !== 0 && dz !== 0)) continue
    for (const side of [1, -1]) {
      const u = { x: dz / 2 * side, z: -dx / 2 * side }
      const lane = [branch[k], ...Array.from({ length: STANDING_LANE_LENGTH }, (_, i) => ({ x: branch[k].x + u.x * (i + 1), z: branch[k].z + u.z * (i + 1) }))]
      const standing = { fork: k, lane }
      const ground = standingGround(standing)
      if (ground.some(p => p.x < 1 || p.z < 1 || p.x >= map.width - 1 || p.z >= map.depth - 1 || !openGround(map, p))) continue
      // Off the road and every track: the lane is a place, not a crossing.
      if (ground.some(p => map.road!.some(q => q.x === p.x && q.z === p.z) || branch.some(q => q.x === p.x && q.z === p.z))) continue
      const share = (last - k) / last
      const score = Math.abs(share - STANDING_IDEAL_SHARE) * 10 + ground.filter(p => trunks.has(key(map, p))).length
      if (!best || score < best.score) best = { score, standing }
    }
  }
  return best?.standing ?? null
}

/** The standing for the current building layout, kept where it is until something is built over it. */
export function currentStanding(sim: { standing?: StandingCache; trees: readonly TreePlacement[]; felled: ReadonlySet<number> }, map: GameMap): HorseStanding | null {
  const cache = sim.standing
  if (cache && cache.buildings === map.buildings) return cache.standing
  if (cache?.standing && standingOpen(map, cache.standing)) { cache.buildings = map.buildings; return cache.standing }
  const standing = findHorseStanding(map, sim.trees, sim.felled)
  sim.standing = { buildings: map.buildings, standing }
  return standing
}

/** The middle of the lane in world space, for gathering what stands near it. */
export function standingCentre(map: GameMap, standing: HorseStanding): { x: number; z: number } {
  const middle = standing.lane[Math.floor(standing.lane.length / 2)]
  return { x: tileToWorldX(map, middle.x), z: tileToWorldZ(map, middle.z) }
}
