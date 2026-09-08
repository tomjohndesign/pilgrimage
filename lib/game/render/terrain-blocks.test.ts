import { expect, it } from "vitest"
import { sameRoadSnapshot, terrainBlocks } from "./terrain-blocks"
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
