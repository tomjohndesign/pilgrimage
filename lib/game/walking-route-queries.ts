import { footpathRouteCost } from "./footpaths"
import type { GameMap, TilePos } from "./map/types"

interface Queries {
  edgeCost: typeof footpathRouteCost
  segments: [Map<number, number>, Map<number, number>]
}
const scopes = new WeakMap<GameMap, Queries>()
interface CostBlock { seen: Uint32Array; values: Float64Array }
const workspaces = new WeakMap<GameMap, { width: number; depth: number; epoch: number; blocks: (CostBlock | undefined)[] }>()
const BLOCK_CELLS = 1024

/** Group departures that inspect the same ground before anyone moves. This
 * shares route facts across NPCs without retaining stale wear or geometry
 * between simulation steps. Callers must not mutate ground inside the scope. */
export function withWalkingRouteQueries<T>(map: GameMap, read: () => T): T {
  if (scopes.has(map)) return read()
  const costs = new Map<number, number>(), size = map.width * map.depth
  let workspace = workspaces.get(map)
  if (!workspace || workspace.width !== map.width || workspace.depth !== map.depth) {
    workspace = { width: map.width, depth: map.depth, epoch: 0, blocks: [] }
    workspaces.set(map, workspace)
  }
  if (++workspace.epoch >= 0xffffffff) {
    for (const block of workspace.blocks) block?.seen.fill(0)
    workspace.epoch = 1
  }
  const epoch = workspace.epoch, blocks = workspace.blocks
  const edgeCost: typeof footpathRouteCost = (ground, from, to) => {
    if (ground !== map || !inside(map, from) || !inside(map, to)) return footpathRouteCost(ground, from, to)
    const dx = to.x - from.x, dz = to.z - from.z
    if (size <= 512 * 512 && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
      // A* and sampled chords ask about the same nine neighbouring edges.
      // Sparse typed blocks avoid boxed 52-bit Map keys and per-tick entries.
      // Epochs discard wear answers without clearing the whole map each tick.
      const source = from.z * map.width + from.x, cell = Math.floor(source / BLOCK_CELLS)
      let block = blocks[cell]
      if (!block) blocks[cell] = block = { seen: new Uint32Array(BLOCK_CELLS * 9), values: new Float64Array(BLOCK_CELLS * 9) }
      const at = (source % BLOCK_CELLS) * 9 + (dz + 1) * 3 + dx + 1
      if (block.seen[at] !== epoch) {
        block.values[at] = footpathRouteCost(map, from, to); block.seen[at] = epoch
      }
      return block.values[at]
    }
    const key = (from.z * map.width + from.x) * size + to.z * map.width + to.x
    let cost = costs.get(key)
    if (cost === undefined) { cost = footpathRouteCost(map, from, to); costs.set(key, cost) }
    return cost
  }
  scopes.set(map, { edgeCost, segments: [new Map(), new Map()] })
  try { return read() }
  finally { scopes.delete(map) }
}

function inside(map: GameMap, p: TilePos) {
  return Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= 0 && p.z >= 0 && p.x < map.width && p.z < map.depth
}

export function walkingRouteQueries(map: GameMap) { return scopes.get(map) }
