import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { terrainHiddenFaces, compactTerrainFaces } from "./terrain-hidden-faces"
import { parseAsciiMap } from "../map/prototype-map"
import { DEFAULT_ELEVATION } from "../map/elevation"

describe("buried terrain faces", () => {
  it("removes interior faces but retains every outside wall", () => {
    expect([...terrainHiddenFaces({ width: 3, depth: 3 }, new Map())]).toEqual([
      5, 7, 6, 13, 15, 14, 9, 11, 10,
    ])
  })
  it("retains cliffs and sloping gaps in both edge endpoints", () => {
    const map = parseAsciiMap(["..."])
    map.elevation = { settings: DEFAULT_ELEVATION, height: [0, 1, 0], corners: [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0], slope: [0, 0, 0], cliffs: [0, 0, 0] }
    expect([...terrainHiddenFaces(map, new Map())]).toEqual([1, 0, 2])
    // One mismatched endpoint is enough to expose a triangular gap.
    map.elevation.corners[1] = 2
    expect([...terrainHiddenFaces(map, new Map())]).toEqual([0, 0, 2])
  })
  it("preserves walls on both sides of clipped cliff and shoreline tiles", () => {
    expect([...terrainHiddenFaces({ width: 3, depth: 1 }, new Map([[1, {}]]))]).toEqual([0, 0, 0])
  })
})

it("submits only tops for enclosed tile batches and restores exposed faces after map edits", () => {
  const geometry = new THREE.BoxGeometry(), original = [...geometry.index!.array]
  const surface = new THREE.InstancedBufferAttribute(new Float32Array(12), 4)
  geometry.setAttribute("aSurface", surface)
  for (let i = 0; i < 3; i++) surface.setY(i, 30 + i % 2)
  const index = geometry.index
  compactTerrainFaces(geometry, 3)
  expect(geometry.index).toBe(index)
  expect(geometry.drawRange.count).toBe(6)
  const normal = geometry.getAttribute("normal")
  for (let i = 0; i < 6; i++) expect(normal.getY(index!.getX(i))).toBe(1)
  surface.setY(1, 0) // One exposed tile prevents removing any side globally.
  compactTerrainFaces(geometry, 3)
  expect(geometry.drawRange.count).toBe(30)
  expect([...index!.array].slice(0, 30)).toEqual(original.filter(vertex => normal.getY(vertex) >= 0))
  compactTerrainFaces(geometry, 0)
  expect(geometry.drawRange.count).toBe(0)
  geometry.dispose()
})
