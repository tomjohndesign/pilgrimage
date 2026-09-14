import { expect, it } from "vitest"
import type { GameMap } from "./map/types"
import { wayfindingNetwork } from "./wayfinding-nodes"

function world(): GameMap {
  return { width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [],
    road: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 2 }, { x: 3, z: 3 }],
    site: { hovelId: "chapel", junction: 2, door: { x: 5, z: 3 }, branch: [{ x: 3, z: 1 }, { x: 4, z: 1 }, { x: 5, z: 1 }, { x: 5, z: 2 }, { x: 5, z: 3 }] } }
}
it("exposes road turns, enclave approach turns, entrance and junction nodes with real route geometry", () => {
  const map = world(), network = wayfindingNetwork(map)
  expect(network.nodes.find(n => n.id === "enclave:door")?.tile).toEqual(map.site!.door)
  expect(network.nodes.find(n => n.id === "enclave:junction")?.tile).toEqual({ x: 3, z: 1 })
  expect(network.nodes.some(n => n.kind === "enclave" && n.tile.x === 5 && n.tile.z === 1)).toBe(true)
  expect(network.nodes.some(n => n.kind === "road" && n.tile.x === 3 && n.tile.z === 1)).toBe(true)
  expect(network.paths.find(p => p.id === "enclave")?.tiles).toEqual(map.site!.branch)
  for (const node of network.nodes) for (const id of node.links) expect(network.nodes.find(n => n.id === id)?.links).toContain(node.id)
})
it("updates building entrances on rotation, exposes every well side, and removes demolished building nodes", () => {
  const map = world()
  map.buildings = [{ id: "well", label: "Well", buildType: "well", x: 7, z: 7, w: 1, d: 1, height: 1, color: "tan", roofColor: "brown" }]
  expect(wayfindingNetwork(map).nodes.filter(n => n.buildingId === "well")).toHaveLength(4)
  map.buildings[0].buildType = "alms-table"
  const before = wayfindingNetwork(map).nodes.find(n => n.buildingId === "well")!.tile
  map.buildings[0].rotation = 1
  expect(wayfindingNetwork(map).nodes.find(n => n.buildingId === "well")!.tile).not.toEqual(before)
  map.buildings = []
  expect(wayfindingNetwork(map).nodes.some(n => n.buildingId === "well")).toBe(false)
})
it("marks bridge entry and exit even along a straight road", () => {
  const map = world(); map.tiles[1 * map.width + 2] = "bridge"
  expect(wayfindingNetwork(map).nodes.some(n => n.kind === "bridge" && n.tile.x === 2 && n.tile.z === 1)).toBe(true)
})

it("splits a straight road at the enclave junction so the branch is connected", () => {
  const map = world()
  map.road = [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }, { x: 4, z: 1 }, { x: 5, z: 1 }]
  const network = wayfindingNetwork(map), junction = network.nodes.find(n => n.id === "enclave:junction")!
  const roadNode = network.nodes.find(n => n.kind === "road" && n.tile.x === 3 && n.tile.z === 1)!
  expect(junction.links).toContain(roadNode.id)
  expect(roadNode.links.filter(id => network.nodes.find(n => n.id === id)?.kind === "road")).toHaveLength(2)
})
