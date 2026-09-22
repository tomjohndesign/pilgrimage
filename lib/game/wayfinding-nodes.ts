import { buildingApproaches, buildingEntry, wellApproaches } from "./building-rotation"
import type { GameMap, TilePos } from "./map/types"

export interface WayfindingNode {
  id: string
  label: string
  kind: "entrance" | "enclave" | "junction" | "road" | "trail" | "bridge" | "forest"
  tile: TilePos
  buildingId?: string
  /** Connected authored-route nodes; paths always retain their full geometry. */
  links: string[]
}
export interface WayfindingNetwork {
  nodes: WayfindingNode[]
  paths: { id: string; kind: WayfindingNode["kind"]; tiles: readonly TilePos[] }[]
}
const networks = new WeakMap<GameMap, { key: string; value: WayfindingNetwork }>()

/** All authored turns and access decisions, independent of actor visibility.
 * Grid search bends are shown by the separate live journey layer. */
export function wayfindingNetwork(map: GameMap): WayfindingNetwork {
  const key = JSON.stringify([map.buildings.map(b => [b.id, b.buildType, b.x, b.z, b.w, b.d, b.rotation, b.layoutSeed]),
    map.site, map.road, map.shortcuts, map.crossroads, map.darkForests, map.buildingAccessTiles, map.footpaths?.ground,
    (map.road ?? []).map(p => map.tiles[p.z * map.width + p.x])])
  const previous = networks.get(map)
  if (previous?.key === key) return previous.value
  const nodes: WayfindingNode[] = [], paths: WayfindingNetwork["paths"] = []
  const decisions = new Set<string>()
  const decision = (p: TilePos | undefined) => { if (p) decisions.add(`${p.x},${p.z}`) }
  if (map.site) { decision(map.site.door); decision(map.road?.[map.site.junction]) }
  for (const trail of map.shortcuts ?? []) { decision(map.road?.[trail.entry]); decision(map.road?.[trail.exit]) }
  for (const junction of map.crossroads ?? []) decision(junction.junction)
  for (const building of map.buildings) for (const entry of buildingApproaches(map, building)) decision(entry)
  const add = (id: string, label: string, kind: WayfindingNode["kind"], tile: TilePos, buildingId?: string) => {
    const node = { id, label, kind, tile: { ...tile }, buildingId, links: [] as string[] }; nodes.push(node); return node
  }
  const path = (id: string, label: string, kind: WayfindingNode["kind"], tiles: readonly TilePos[], buildingId?: string) => {
    if (!tiles.length) return
    paths.push({ id, kind, tiles })
    let previous: WayfindingNode | undefined
    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i - 1], p = tiles[i], b = tiles[i + 1]
      const turn = !a || !b || (p.x - a.x) * (b.z - p.z) !== (p.z - a.z) * (b.x - p.x) || (p.x - a.x) * (b.x - p.x) + (p.z - a.z) * (b.z - p.z) < 0
      const crossing = map.tiles[p.z * map.width + p.x] === "bridge" && (!a || !b ||
        map.tiles[a.z * map.width + a.x] !== "bridge" || map.tiles[b.z * map.width + b.x] !== "bridge")
      if (!turn && !crossing && !decisions.has(`${p.x},${p.z}`)) continue
      const node = add(`${id}:${p.x},${p.z}`, `${label} · ${i === 0 ? "start" : i === tiles.length - 1 ? "end" : crossing ? "bridge" : "turn"}`, crossing ? "bridge" : kind, p, buildingId)
      if (previous) { previous.links.push(node.id); node.links.push(previous.id) }
      previous = node
    }
  }
  path("road", "Main road", "road", map.road ?? [])
  if (map.site) {
    path("enclave", "Enclave approach", "enclave", map.site.branch, map.site.hovelId)
    add("enclave:door", "Enclave entrance", "enclave", map.site.door, map.site.hovelId)
    const junction = map.road?.[map.site.junction]
    if (junction) add("enclave:junction", "Enclave road junction", "junction", junction, map.site.hovelId)
  }
  for (const b of map.buildings) {
    const entrances = b.buildType === "well" ? wellApproaches(b) : buildingApproaches(map, b)
    for (const [i, tile] of entrances.entries()) add(`building:${b.id}:${i}`, `${b.label} · approach ${i + 1}`, "entrance", tile, b.id)
    if (!entrances.length) add(`building:${b.id}:0`, `${b.label} · frontage`, "entrance", buildingEntry(b), b.id)
  }
  for (const [i, trail] of (map.shortcuts ?? []).entries()) path(`trail:${i}`, `Trail ${i + 1}`, "trail", trail.tiles)
  for (const [i, forest] of (map.darkForests ?? []).entries()) path(`forest:${i}`, `Forest approach ${i + 1}`, "forest", forest.approach)
  for (const junction of map.crossroads ?? []) {
    // The signpost itself is an obstacle; the road junction is the traversable node.
    if (junction.junction) add(`junction:${junction.center.x},${junction.center.z}`, "Signed junction", "junction", junction.junction)
  }
  // Coincident route endpoints and doors connect without inventing straight
  // traversable links across terrain between otherwise unrelated nodes.
  const cells = new Map<string, WayfindingNode[]>()
  for (const node of nodes) {
    const key = `${node.tile.x},${node.tile.z}`, cell = cells.get(key) ?? []
    for (const other of cell) { node.links.push(other.id); other.links.push(node.id) }
    cell.push(node); cells.set(key, cell)
  }
  const value = { nodes, paths }; networks.set(map, { key, value }); return value
}
