import type { GameMap } from "../map/types"
import { DEFAULT_ELEVATION } from "../map/elevation"
import { expect, it } from "vitest"
import { sameRoadSnapshot, terrainBlocks, terrainBlockState, terrainMapSnapshot } from "./terrain-blocks"
import type { RoadSegment } from "./road-segments"

it("covers every tile exactly once, including incomplete blocks on the largest map", () => {
  for (const [width, depth] of [[512, 512], [25, 49]]) {
    const visits = new Uint8Array(width * depth)
    for (const b of terrainBlocks(width, depth)) {
      for (let z = b.z; z < b.endZ; z++) for (let x = b.x; x < b.endX; x++) visits[z * width + x]++
    }
    expect(visits.every(count => count === 1)).toBe(true)
  }
})

it("invalidates road buffers for compaction, new paths, vanished paths and changed segment coordinates", () => {
  const road: RoadSegment = [0, 0, 1, 1, 4, .2]
  const snapshot = { roads: new Map([[12, [road]]]), wear: [.6, 6] }
  expect(sameRoadSnapshot(snapshot, { roads: new Map([[12, [[...road]]]]), wear: [.6, 6] })).toBe(true)
  expect(sameRoadSnapshot(snapshot, { ...snapshot, wear: [.7, 6] })).toBe(false)
  expect(sameRoadSnapshot(snapshot, { ...snapshot, roads: new Map() })).toBe(false)
  expect(sameRoadSnapshot(snapshot, { ...snapshot, roads: new Map([[12, [road]], [13, [road]]]) })).toBe(false)
  expect(sameRoadSnapshot(snapshot, { ...snapshot, roads: new Map([[12, [[0, 0, 1, 1, 4, .3]]]]) })).toBe(false)
  expect(sameRoadSnapshot(snapshot, { ...snapshot, roads: new Map([[12, [[0, 0, .9, 1, 4, .2]]]]) })).toBe(false)
})

it("rebuilds only nearby terrain for placement, and retains it through construction and ownership changes", () => {
  const map: GameMap = { width: 192, depth: 192, tiles: Array(192 * 192).fill("grass"), buildings: [] }
  const blocks = terrainBlocks(map.width, map.depth), first = terrainBlockState(map, blocks)
  const building = { id: "hut", label: "Hut", buildType: "shelter", x: 20, z: 20, w: 2, d: 2, height: 1, color: "tan", roofColor: "brown",
    construction: { work: 0, required: 10 } }
  const placed = { ...map, buildings: [building] }, second = terrainBlockState(placed, blocks, first)
  expect(second.revisions.filter((revision, i) => revision !== first.revisions[i])).toHaveLength(1)
  const completed = { ...placed, buildings: [{ ...building, construction: { work: 10, required: 10 }, owner: "independent" as const }] }
  expect(terrainMapSnapshot(completed, placed)).toBe(placed)
  expect(terrainBlockState(completed, blocks, second).revisions.every((revision, i) => revision === second.revisions[i])).toBe(true)
  const removed = terrainBlockState(map, blocks, second)
  expect(removed.revisions[0]).not.toBe(second.revisions[0])
  expect(removed.revisions.slice(1).every((revision, i) => revision === second.revisions[i + 1])).toBe(true)
})

it("updates both sides of block boundaries and observes grading away from a new footprint", () => {
  const size = 144, count = size * size
  const map: GameMap = { width: size, depth: size, tiles: Array(count).fill("grass"), buildings: [],
    elevation: { settings: DEFAULT_ELEVATION, height: Array(count).fill(0), corners: Array(count * 4).fill(0), slope: Array(count).fill(0), cliffs: Array(count).fill(0) } }
  const blocks = terrainBlocks(size, size), first = terrainBlockState(map, blocks)
  const corners = [...map.elevation!.corners]
  corners[(47 * size + 47) * 4 + 3] = .1
  const graded = { ...map, elevation: { ...map.elevation!, corners } }, next = terrainBlockState(graded, blocks, first)
  expect(next.revisions.map((revision, i) => revision !== first.revisions[i])).toEqual([true, true, false, true, true, false, false, false, false])
  expect(terrainMapSnapshot(graded, map)).toBe(graded)
  const regenerated = { ...map, tiles: [...map.tiles] }, reset = terrainBlockState(regenerated, blocks, next)
  expect(reset.revisions.every((revision, i) => revision !== next.revisions[i])).toBe(true)
})
